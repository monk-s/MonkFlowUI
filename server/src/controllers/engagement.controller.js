/**
 * MonkFlow staff: run a client's engagement tracker.
 * Mounted under /api/v1/admin/organizations/:id (authenticate + requireSuperadmin).
 *
 * Staff create and edit engagements, milestones and requests, attach
 * workflows to a workspace and set the time-saved baseline. Clients only
 * read these, sign off milestones and mark requests done (routes/portal).
 *
 * Every change is written to that client's audit log as monkflow_staff, and
 * every statement names the workspace, so an id from another client's
 * workspace is a 404.
 */
const { z } = require('zod');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const { query } = require('../config/database');
const { coded } = require('../middleware/session');
const { UUID } = require('../portal/withOrg');
const { audit } = require('../portal/audit');
const { generateToken, hashToken } = require('../utils/crypto');
const { STAGES, MILESTONE_STATUSES, ACTION_KINDS, day, engagementView, actionItemView } = require('../portal/engagements');

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-12-01').nullable().optional();
const text = (max) => z.string().trim().max(max).nullable().optional();

const engagementSchema = z.object({
  name: z.string().trim().min(2).max(200),
  summary: text(2000),
  stage: z.enum(STAGES).optional(),
  status: z.enum(['active', 'on_hold', 'complete']).optional(),
  nextDeliverable: text(300),
  nextDeliverableDue: date,
});
const milestoneSchema = z.object({
  stage: z.enum(STAGES),
  title: z.string().trim().min(2).max(200),
  detail: text(2000),
  dueOn: date,
  status: z.enum(MILESTONE_STATUSES).optional(),
});
const actionSchema = z.object({
  kind: z.enum(ACTION_KINDS),
  title: z.string().trim().min(2).max(200),
  detail: text(2000),
  dueOn: date,
  engagementId: z.string().uuid().nullable().optional(),
});
const baselineSchema = z.object({
  baselineMinutesPerRun: z.number().positive().max(6000).nullable(),
  baselineBasis: text(300),
  baselineFrom: date,
});

const parse = (schema, body) => {
  const out = schema.safeParse(body);
  if (!out.success) {
    const first = out.error.errors[0];
    throw coded(400, 'invalid_input', `${first.path.join('.') || 'input'}: ${first.message}`);
  }
  return out.data;
};
const uuid = (v) => { if (!UUID.test(String(v || ''))) throw ApiError.notFound('Not found'); return v; };

async function orgOf(req) {
  const org = (await query('SELECT id, name FROM organizations WHERE id = $1', [uuid(req.params.id)])).rows[0];
  if (!org) throw ApiError.notFound('Not found');
  return org;
}
const log = (req, org, action, targetType, targetId, metadata) => audit(null, req, {
  orgId: org.id, actorUserId: req.user.userId, actorEmail: req.user.email, actorRole: 'monkflow_staff',
  action, targetType, targetId, metadata,
});

const workflowView = (w) => ({
  id: w.id, name: w.name, status: w.status, lastRunAt: w.last_run_at,
  baselineMinutesPerRun: w.baseline_minutes_per_run == null ? null : Number(w.baseline_minutes_per_run),
  baselineBasis: w.baseline_basis, baselineFrom: day(w.baseline_from),
});

const ingestKeyView = (k) => ({ id: k.id, name: k.name, prefix: k.key_prefix, createdAt: k.created_at, lastUsedAt: k.last_used_at });

const get = catchAsync(async (req, res) => {
  const org = await orgOf(req);
  const [engagements, milestones, actions, workflows, unassigned, ingestKeys, connections] = await Promise.all([
    query('SELECT * FROM engagements WHERE org_id = $1 ORDER BY created_at, id', [org.id]),
    query('SELECT * FROM milestones WHERE org_id = $1 ORDER BY position, created_at, id', [org.id]),
    query("SELECT * FROM action_items WHERE org_id = $1 AND (status = 'open' OR updated_at > NOW() - INTERVAL '30 days') ORDER BY status = 'open' DESC, created_at DESC LIMIT 100", [org.id]),
    query('SELECT id, name, status, last_run_at, baseline_minutes_per_run, baseline_basis, baseline_from FROM workflows WHERE org_id = $1 ORDER BY lower(name)', [org.id]),
    // Workflows that belong to no client yet (built under a staff login).
    query('SELECT id, name, status FROM workflows WHERE org_id IS NULL ORDER BY lower(name) LIMIT 200'),
    query('SELECT id, name, key_prefix, created_at, last_used_at FROM ingest_keys WHERE org_id = $1 AND revoked_at IS NULL ORDER BY created_at', [org.id]),
    query('SELECT * FROM connections WHERE org_id = $1 ORDER BY lower(system)', [org.id]),
  ]);
  res.json({
    organization: org,
    engagements: engagements.rows.map((e) => engagementView(e, milestones.rows)),
    actions: actions.rows.map(actionItemView),
    workflows: workflows.rows.map(workflowView),
    unassignedWorkflows: unassigned.rows,
    ingestKeys: ingestKeys.rows.map(ingestKeyView),
    connections: connections.rows.map(connectionView),
  });
});

const createEngagement = catchAsync(async (req, res) => {
  const org = await orgOf(req);
  const d = parse(engagementSchema, req.body);
  const e = (await query(
    `INSERT INTO engagements (org_id, name, summary, stage, status, next_deliverable, next_deliverable_due)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [org.id, d.name, d.summary || null, d.stage || 'discovery', d.status || 'active', d.nextDeliverable || null, d.nextDeliverableDue || null]
  )).rows[0];
  await log(req, org, 'engagement.created', 'engagement', e.id, { name: e.name, stage: e.stage });
  res.status(201).json({ engagement: engagementView(e, []) });
});

const updateEngagement = catchAsync(async (req, res) => {
  const org = await orgOf(req);
  const d = parse(engagementSchema.partial(), req.body);
  const cur = (await query('SELECT * FROM engagements WHERE id = $1 AND org_id = $2', [uuid(req.params.eid), org.id])).rows[0];
  if (!cur) throw ApiError.notFound('Not found');
  const pick = (key, col) => (d[key] !== undefined ? (d[key] === '' ? null : d[key]) : cur[col]);
  const e = (await query(
    `UPDATE engagements SET name = $3, summary = $4, stage = $5, status = $6, next_deliverable = $7, next_deliverable_due = $8, updated_at = NOW()
      WHERE id = $1 AND org_id = $2 RETURNING *`,
    [cur.id, org.id, d.name ?? cur.name, pick('summary', 'summary'), d.stage ?? cur.stage, d.status ?? cur.status,
      pick('nextDeliverable', 'next_deliverable'), pick('nextDeliverableDue', 'next_deliverable_due')]
  )).rows[0];
  if (e.stage !== cur.stage) await log(req, org, 'engagement.stage_changed', 'engagement', e.id, { name: e.name, from: cur.stage, to: e.stage });
  const other = Object.keys(d).filter((k) => k !== 'stage');
  if (other.length) await log(req, org, 'engagement.updated', 'engagement', e.id, { name: e.name, changed: other });
  res.json({ engagement: { id: e.id, stage: e.stage, status: e.status } });
});

const createMilestone = catchAsync(async (req, res) => {
  const org = await orgOf(req);
  const d = parse(milestoneSchema, req.body);
  const e = (await query('SELECT id FROM engagements WHERE id = $1 AND org_id = $2', [uuid(req.params.eid), org.id])).rows[0];
  if (!e) throw ApiError.notFound('Not found');
  const m = (await query(
    `INSERT INTO milestones (org_id, engagement_id, stage, title, detail, due_on, status, position)
     VALUES ($1, $2, $3, $4, $5, $6, $7, (SELECT COALESCE(max(position), 0) + 1 FROM milestones WHERE engagement_id = $2))
     RETURNING *`,
    [org.id, e.id, d.stage, d.title, d.detail || null, d.dueOn || null, d.status || 'planned']
  )).rows[0];
  await log(req, org, 'engagement.milestone_added', 'milestone', m.id, { title: m.title, stage: m.stage, engagementId: e.id });
  if (m.status === 'awaiting_signoff') await log(req, org, 'engagement.milestone_ready', 'milestone', m.id, { title: m.title, engagementId: e.id });
  res.status(201).json({ milestone: { id: m.id, status: m.status } });
});

// What a client signed stays as they signed it.
const assertNotSigned = (m) => {
  if (m.signed_off_at) throw coded(409, 'signed_off', `${m.signed_off_by_name || 'The client'} signed this milestone off. It can no longer be changed.`);
};

const updateMilestone = catchAsync(async (req, res) => {
  const org = await orgOf(req);
  const d = parse(milestoneSchema.partial(), req.body);
  const cur = (await query('SELECT * FROM milestones WHERE id = $1 AND org_id = $2', [uuid(req.params.mid), org.id])).rows[0];
  if (!cur) throw ApiError.notFound('Not found');
  assertNotSigned(cur);
  const m = (await query(
    `UPDATE milestones SET stage = $3, title = $4, detail = $5, due_on = $6, status = $7, updated_at = NOW()
      WHERE id = $1 AND org_id = $2 AND signed_off_at IS NULL RETURNING *`,
    [cur.id, org.id, d.stage ?? cur.stage, d.title ?? cur.title, d.detail !== undefined ? (d.detail || null) : cur.detail,
      d.dueOn !== undefined ? (d.dueOn || null) : cur.due_on, d.status ?? cur.status]
  )).rows[0];
  if (!m) throw coded(409, 'signed_off', 'This milestone was just signed off. It can no longer be changed.');
  const meta = { title: m.title, engagementId: m.engagement_id };
  if (m.status !== cur.status && m.status === 'awaiting_signoff') await log(req, org, 'engagement.milestone_ready', 'milestone', m.id, meta);
  else if (m.status !== cur.status && m.status === 'complete') await log(req, org, 'engagement.milestone_completed', 'milestone', m.id, meta);
  else await log(req, org, 'engagement.milestone_updated', 'milestone', m.id, { ...meta, changed: Object.keys(d), ...(m.status !== cur.status ? { from: cur.status, to: m.status } : {}) });
  res.json({ milestone: { id: m.id, status: m.status } });
});

const removeMilestone = catchAsync(async (req, res) => {
  const org = await orgOf(req);
  const cur = (await query('SELECT * FROM milestones WHERE id = $1 AND org_id = $2', [uuid(req.params.mid), org.id])).rows[0];
  if (!cur) throw ApiError.notFound('Not found');
  assertNotSigned(cur);
  const gone = await query('DELETE FROM milestones WHERE id = $1 AND org_id = $2 AND signed_off_at IS NULL', [cur.id, org.id]);
  if (!gone.rowCount) throw coded(409, 'signed_off', 'This milestone was just signed off. It can no longer be removed.');
  await log(req, org, 'engagement.milestone_removed', 'milestone', cur.id, { title: cur.title, engagementId: cur.engagement_id });
  res.json({ ok: true });
});

const createAction = catchAsync(async (req, res) => {
  const org = await orgOf(req);
  const d = parse(actionSchema, req.body);
  if (d.engagementId) {
    const e = (await query('SELECT 1 FROM engagements WHERE id = $1 AND org_id = $2', [d.engagementId, org.id])).rows[0];
    if (!e) throw coded(400, 'invalid_input', 'That engagement is not in this workspace.');
  }
  const a = (await query(
    'INSERT INTO action_items (org_id, engagement_id, kind, title, detail, due_on) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
    [org.id, d.engagementId || null, d.kind, d.title, d.detail || null, d.dueOn || null]
  )).rows[0];
  await log(req, org, 'action.requested', 'action_item', a.id, { title: a.title, kind: a.kind });
  res.status(201).json({ action: actionItemView(a) });
});

// Staff can take a request back. Marking it done is the client's to do.
const withdrawAction = catchAsync(async (req, res) => {
  const org = await orgOf(req);
  const a = (await query(
    "UPDATE action_items SET status = 'withdrawn', updated_at = NOW() WHERE id = $1 AND org_id = $2 AND status = 'open' AND origin = 'monkflow' RETURNING id, title",
    [uuid(req.params.aid), org.id]
  )).rows[0];
  if (!a) throw ApiError.notFound('Not found');
  await log(req, org, 'action.withdrawn', 'action_item', a.id, { title: a.title });
  res.json({ ok: true });
});

// A request the client made (origin = 'client') is closed by MonkFlow, with
// the answer the client will read.
const closeRequest = catchAsync(async (req, res) => {
  const org = await orgOf(req);
  const d = parse(z.object({ reply: z.string().trim().min(2, 'Write the reply the client will read').max(4000) }), req.body);
  const a = (await query(
    `UPDATE action_items SET status = 'done', reply = $3, completed_by_name = 'MonkFlow', completed_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND org_id = $2 AND status = 'open' AND origin = 'client' RETURNING id, title`,
    [uuid(req.params.aid), org.id, d.reply]
  )).rows[0];
  if (!a) throw ApiError.notFound('Not found');
  await log(req, org, 'request.closed', 'action_item', a.id, { title: a.title });
  res.json({ ok: true });
});

// ── Integration status (the client's Integrations page) ──────
// Status and a note only. Never a credential: those stay out of this table.
const CONNECTION_STATUSES = ['planned', 'healthy', 'attention', 'down'];
const connectionSchema = z.object({
  system: z.string().trim().min(2, 'Name the system').max(100),
  status: z.enum(CONNECTION_STATUSES),
  note: text(500),
  synced: z.boolean().optional(),   // true = stamp "last sync" with now
});
const connectionView = (c) => ({ id: c.id, system: c.system, status: c.status, note: c.note, lastSyncAt: c.last_sync_at, updatedAt: c.updated_at });

const saveConnection = catchAsync(async (req, res) => {
  const org = await orgOf(req);
  const d = parse(connectionSchema, req.body);
  const c = req.params.cid
    ? (await query(
      `UPDATE connections SET system = $3, status = $4, note = $5, last_sync_at = CASE WHEN $6 THEN NOW() ELSE last_sync_at END, updated_at = NOW()
        WHERE id = $1 AND org_id = $2 RETURNING *`,
      [uuid(req.params.cid), org.id, d.system, d.status, d.note || null, !!d.synced]
    )).rows[0]
    : (await query(
      'INSERT INTO connections (org_id, system, status, note, last_sync_at) VALUES ($1, $2, $3, $4, CASE WHEN $5 THEN NOW() END) RETURNING *',
      [org.id, d.system, d.status, d.note || null, !!d.synced]
    )).rows[0];
  if (!c) throw ApiError.notFound('Not found');
  await log(req, org, 'connection.status_set', 'connection', c.id, { system: c.system, status: c.status });
  res.status(req.params.cid ? 200 : 201).json({ connection: connectionView(c) });
});

const removeConnection = catchAsync(async (req, res) => {
  const org = await orgOf(req);
  const c = (await query('DELETE FROM connections WHERE id = $1 AND org_id = $2 RETURNING id, system', [uuid(req.params.cid), org.id])).rows[0];
  if (!c) throw ApiError.notFound('Not found');
  await log(req, org, 'connection.removed', 'connection', c.id, { system: c.system });
  res.json({ ok: true });
});

// Only a workflow that belongs to no workspace can be attached, so one
// client's workflow can never be moved into another client's view.
const attachWorkflow = catchAsync(async (req, res) => {
  const org = await orgOf(req);
  const d = parse(z.object({ workflowId: z.string().uuid() }), req.body);
  const w = (await query('UPDATE workflows SET org_id = $1, updated_at = NOW() WHERE id = $2 AND org_id IS NULL RETURNING id, name', [org.id, d.workflowId])).rows[0];
  if (!w) throw coded(409, 'not_attachable', 'That workflow already belongs to a workspace, or no longer exists.');
  await log(req, org, 'workflow.attached', 'workflow', w.id, { workflow: w.name });
  res.status(201).json({ workflow: w });
});

const setBaseline = catchAsync(async (req, res) => {
  const org = await orgOf(req);
  const d = parse(baselineSchema, req.body);
  const minutes = d.baselineMinutesPerRun;
  // A baseline is a claim about the client's own process, so it is never
  // saved without the sentence that says where the number came from.
  if (minutes != null && !(d.baselineBasis || '').trim()) {
    throw coded(400, 'invalid_input', 'Say where the baseline comes from (who agreed it, and when). The client sees this next to the hours figure.');
  }
  const w = (await query(
    `UPDATE workflows SET baseline_minutes_per_run = $3, baseline_basis = $4, baseline_from = $5, updated_at = NOW()
      WHERE id = $1 AND org_id = $2 RETURNING id, name, status, last_run_at, baseline_minutes_per_run, baseline_basis, baseline_from`,
    [uuid(req.params.wid), org.id, minutes, minutes == null ? null : d.baselineBasis.trim(),
      minutes == null ? null : (d.baselineFrom || new Date().toISOString().slice(0, 10))]
  )).rows[0];
  if (!w) throw ApiError.notFound('Not found');
  if (minutes == null) await log(req, org, 'engagement.baseline_cleared', 'workflow', w.id, { workflow: w.name });
  else await log(req, org, 'engagement.baseline_set', 'workflow', w.id, { workflow: w.name, minutes, basis: w.baseline_basis, from: day(w.baseline_from) });
  res.json({ workflow: workflowView(w) });
});

// ── Ingest keys ───────────────────────────────────────────────
// The key is shown once, here; only its hash is stored.
const createIngestKey = catchAsync(async (req, res) => {
  const org = await orgOf(req);
  const { name } = parse(z.object({ name: z.string().trim().min(2).max(100) }), req.body);
  const prefix = `mfi_${generateToken(4)}`;
  const key = `${prefix}_${generateToken(32)}`;
  const row = (await query(
    'INSERT INTO ingest_keys (org_id, name, key_prefix, key_hash) VALUES ($1, $2, $3, $4) RETURNING id, name, key_prefix, created_at, last_used_at',
    [org.id, name, prefix, hashToken(key)]
  )).rows[0];
  await log(req, org, 'ingest_key.created', 'ingest_key', row.id, { name, prefix });
  res.status(201).json({ ingestKey: ingestKeyView(row), key });
});

const revokeIngestKey = catchAsync(async (req, res) => {
  const org = await orgOf(req);
  const row = (await query(
    'UPDATE ingest_keys SET revoked_at = NOW() WHERE id = $1 AND org_id = $2 AND revoked_at IS NULL RETURNING id, name, key_prefix',
    [uuid(req.params.kid), org.id]
  )).rows[0];
  if (!row) throw ApiError.notFound('Not found');
  await log(req, org, 'ingest_key.revoked', 'ingest_key', row.id, { name: row.name, prefix: row.key_prefix });
  res.json({ ok: true });
});

module.exports = { createIngestKey, revokeIngestKey, get, createEngagement, updateEngagement, createMilestone, updateMilestone, removeMilestone, createAction, withdrawAction, attachWorkflow, setBaseline,
  closeRequest, saveConnection, removeConnection,
};
