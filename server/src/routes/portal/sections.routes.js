/**
 * /api/v1/portal — Requests, Vault and Integrations.
 * Follows the rules at the top of ./index.js.
 */
const router = require('express').Router();
const { z } = require('zod');
const catchAsync = require('../../utils/catchAsync');
const ApiError = require('../../utils/ApiError');
const { requirePermission, coded } = require('../../middleware/session');
const { withOrg, UUID } = require('../../portal/withOrg');
const { audit } = require('../../portal/audit');
const { can } = require('../../portal/permissions');
const { TEMPLATES } = require('../../portal/review');
const { day } = require('../../portal/engagements');
const logger = require('../../utils/logger');

const personName = (s) => `${s.firstName || ''} ${s.lastName || ''}`.trim() || s.email;

// ── Requests ──────────────────────────────────────────────────
// Both directions of the same table: what this workspace asked MonkFlow for
// (origin = 'client') and what MonkFlow asked of it (origin = 'monkflow').
const requestView = (a) => ({
  id: a.id, title: a.title, detail: a.detail, status: a.status, createdAt: a.created_at, dueOn: day(a.due_on),
  requestedByName: a.requested_by_name, reply: a.reply, closedByName: a.completed_by_name, closedAt: a.completed_at,
});

router.get('/requests', requirePermission('overview.view'), catchAsync(async (req, res) => {
  const rows = await withOrg(req.session.orgId, async (db) => (await db.query(
    "SELECT * FROM action_items WHERE status <> 'withdrawn' OR origin = 'client' ORDER BY status = 'open' DESC, created_at DESC LIMIT 200"
  )).rows);
  res.json({
    sent: rows.filter((a) => a.origin === 'client').map(requestView),
    received: rows.filter((a) => a.origin === 'monkflow').map(requestView),
    canCreate: can(req.session.role, 'requests.create'),
  });
}));

const requestSchema = z.object({
  title: z.string().trim().min(2, 'Say what you need in a line').max(200),
  detail: z.string().trim().max(4000).optional().default(''),
});

router.post('/requests', requirePermission('requests.create'), catchAsync(async (req, res) => {
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) throw coded(400, 'invalid_input', parsed.error.errors[0].message);
  const name = personName(req.session);
  const out = await withOrg(req.session.orgId, async (db) => {
    const open = (await db.query("SELECT count(*)::int AS n FROM action_items WHERE origin = 'client' AND status = 'open'")).rows[0].n;
    if (open >= 50) throw coded(409, 'too_many_open', 'There are already 50 open requests. Withdraw one, or email us.');
    const row = (await db.query(
      `INSERT INTO action_items (org_id, kind, title, detail, origin, requested_by, requested_by_name)
       VALUES ($1, 'other', $2, $3, 'client', $4, $5) RETURNING *`,
      [req.session.orgId, parsed.data.title, parsed.data.detail || null, req.session.userId, name]
    )).rows[0];
    await audit(db, req, { action: 'request.created', targetType: 'action_item', targetId: row.id, metadata: { title: row.title } });
    const org = (await db.query('SELECT name FROM organizations')).rows[0];
    return { row, orgName: org && org.name };
  });
  // Tell MonkFlow. The request is saved either way.
  try {
    await require('../../services/email.service').sendContactNotification({
      name: `${name} at ${out.orgName}`, email: req.session.email, subject: `Portal request: ${out.row.title}`, message: out.row.detail || '(no detail)',
    });
  } catch (err) { logger.error('request notification failed: %s', err.message); }
  res.status(201).json({ request: requestView(out.row) });
}));

router.post('/requests/:id/withdraw', requirePermission('requests.create'), catchAsync(async (req, res) => {
  if (!UUID.test(req.params.id)) throw ApiError.notFound('Not found');
  await withOrg(req.session.orgId, async (db) => {
    const row = (await db.query(
      "UPDATE action_items SET status = 'withdrawn', updated_at = NOW() WHERE id = $1 AND origin = 'client' AND status = 'open' RETURNING id, title",
      [req.params.id]
    )).rows[0];
    if (!row) throw ApiError.notFound('Not found');
    await audit(db, req, { action: 'request.withdrawn', targetType: 'action_item', targetId: row.id, metadata: { title: row.title } });
  });
  res.json({ ok: true });
}));

// ── Vault ─────────────────────────────────────────────────────
// Every source document stored for the workspace. The file itself opens in
// the Review screen, through the permission-checked, logged route there.
router.get('/vault', requirePermission('vault.view'), catchAsync(async (req, res) => {
  const rows = await withOrg(req.session.orgId, async (db) => (await db.query(
    `SELECT d.id, d.filename, d.byte_size, d.created_at, d.purge_after, d.purged_at, (d.content IS NOT NULL) AS available,
            r.id AS review_id, r.title, r.template, r.status
       FROM documents d LEFT JOIN review_items r ON r.document_id = d.id
      ORDER BY d.created_at DESC LIMIT 500`
  )).rows);
  res.json({
    documents: rows.map((d) => ({
      id: d.id, filename: d.filename, bytes: d.byte_size, storedAt: d.created_at,
      title: d.title || d.filename, typeLabel: d.template ? ((TEMPLATES[d.template] || {}).label || d.template) : null,
      reviewId: d.review_id, reviewStatus: d.status || null,
      available: d.available, deleteAfter: d.purge_after, deletedAt: d.purged_at,
    })),
  });
}));

// ── Integrations ──────────────────────────────────────────────
// Read-only status. MonkFlow holds the credentials and records the status.
router.get('/connections', requirePermission('connectors.view'), catchAsync(async (req, res) => {
  const rows = await withOrg(req.session.orgId, async (db) => (await db.query(
    'SELECT id, system, status, note, last_sync_at, updated_at FROM connections ORDER BY lower(system)'
  )).rows);
  res.json({ connections: rows.map((c) => ({ id: c.id, system: c.system, status: c.status, note: c.note, lastSyncAt: c.last_sync_at, updatedAt: c.updated_at })) });
}));

module.exports = router;
