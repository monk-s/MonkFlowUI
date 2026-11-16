/**
 * /api/v1/portal/review — the review queue.
 * Follows the rules at the top of ./index.js.
 *
 * Items arrive from MonkFlow's pipelines (routes/ingest.routes.js). Here a
 * client reads them, corrects fields, and approves or rejects. A blocking
 * check that fails stops approval unless the reviewer types a reason, which
 * is logged. Field values never go into the audit log (portal/audit.js);
 * the log records which fields changed, and the item keeps the before and
 * after.
 */
const router = require('express').Router();
const { z } = require('zod');
const catchAsync = require('../../utils/catchAsync');
const ApiError = require('../../utils/ApiError');
const { requirePermission, coded } = require('../../middleware/session');
const { withOrg, UUID } = require('../../portal/withOrg');
const { audit } = require('../../portal/audit');
const { can } = require('../../portal/permissions');
const { summary, detail, runChecks, toCsv } = require('../../portal/review');
const secretBox = require('../../utils/secretBox');

const idParam = (req) => {
  if (!UUID.test(req.params.id)) throw ApiError.notFound('Not found');
  return req.params.id;
};
const personName = (s) => `${s.firstName || ''} ${s.lastName || ''}`.trim() || s.email;

const ITEM = `SELECT r.*, w.name AS workflow_name, d.filename AS document_name, d.purge_after AS document_purge_after,
                     (d.id IS NOT NULL AND d.content IS NULL) AS document_purged
                FROM review_items r
                LEFT JOIN org_workflows w ON w.id = r.workflow_id
                LEFT JOIN documents d ON d.id = r.document_id`;

async function load(db, id, lock) {
  if (lock) {
    const locked = (await db.query('SELECT id FROM review_items WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!locked) throw ApiError.notFound('Not found');
  }
  const row = (await db.query(`${ITEM} WHERE r.id = $1`, [id])).rows[0];
  if (!row) throw ApiError.notFound('Not found');
  return row;
}

const trail = async (db, id) => (await db.query(
  `SELECT a.id, a.action, a.metadata, a.created_at, a.actor_role, a.actor_email, m.first_name, m.last_name
     FROM audit_log a LEFT JOIN org_members m ON m.user_id = a.actor_user_id
    WHERE a.target_type = 'review_item' AND a.target_id = $1 AND a.action <> 'review.document_viewed'
    ORDER BY a.id`, [id]
)).rows.map((r) => ({
  id: String(r.id), at: r.created_at, action: r.action, metadata: r.metadata,
  actor: r.actor_role === 'monkflow_staff' || r.actor_role === 'monkflow_pipeline'
    ? 'MonkFlow' : (`${r.first_name || ''} ${r.last_name || ''}`.trim() || r.actor_email || 'Someone'),
}));

const view = async (db, req, row) => ({ ...detail(row), trail: await trail(db, row.id), canDecide: row.status === 'queued' && can(req.session.role, 'review.decide') });

router.get('/review', requirePermission('review.view'), catchAsync(async (req, res) => {
  const status = ['queued', 'approved', 'rejected'].includes(req.query.status) ? req.query.status : null;
  const data = await withOrg(req.session.orgId, async (db) => ({
    // shortcut: newest 200 per request, no paging. Add paging when a queue outgrows it.
    rows: (await db.query(`${ITEM} WHERE ($1::text IS NULL OR r.status = $1) ORDER BY r.received_at DESC, r.id LIMIT 200`, [status])).rows,
    counts: (await db.query('SELECT status, count(*)::int AS n FROM review_items GROUP BY status')).rows,
  }));
  const counts = { queued: 0, approved: 0, rejected: 0 };
  for (const c of data.counts) counts[c.status] = c.n;
  res.json({ items: data.rows.map(summary), counts });
}));

router.get('/review/:id', requirePermission('review.view'), catchAsync(async (req, res) => {
  const id = idParam(req);
  res.json({ item: await withOrg(req.session.orgId, async (db) => view(db, req, await load(db, id))) });
}));

router.get('/review/:id/document', requirePermission('review.view'), catchAsync(async (req, res) => {
  const id = idParam(req);
  const doc = await withOrg(req.session.orgId, async (db) => {
    const row = (await db.query(
      'SELECT d.id, d.org_id, d.filename, d.content FROM review_items r JOIN documents d ON d.id = r.document_id WHERE r.id = $1', [id]
    )).rows[0];
    if (!row || !row.content) throw ApiError.notFound('Not found');
    await audit(db, req, { action: 'review.document_viewed', targetType: 'review_item', targetId: id, metadata: { documentId: row.id } });
    return row;
  });
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `inline; filename="${doc.filename.replace(/[^\w.\- ]/g, '_')}"`,
    // The viewer reloads the file when it jumps to a page; do not log and decrypt each time.
    'Cache-Control': 'private, max-age=300',
  });
  res.send(secretBox.open(doc.content, doc.org_id));
}));

const editSchema = z.object({
  edits: z.array(z.object({ id: z.string().max(20), value: z.string().max(2000) })).min(1).max(500),
});

router.patch('/review/:id/fields', requirePermission('review.decide'), catchAsync(async (req, res) => {
  const id = idParam(req);
  const parsed = editSchema.safeParse(req.body);
  if (!parsed.success) throw coded(400, 'invalid_input', parsed.error.errors[0].message);
  const name = personName(req.session);

  const item = await withOrg(req.session.orgId, async (db) => {
    const row = await load(db, id, true);
    if (row.status !== 'queued') throw coded(409, 'already_decided', 'This document has already been decided and can no longer be edited.');
    const changed = [];
    for (const edit of parsed.data.edits) {
      const field = row.fields.find((f) => f.id === edit.id);
      if (!field) throw coded(400, 'invalid_input', 'That field is not part of this document.');
      const value = edit.value.trim();
      if (value === field.value) continue;
      if (field.original == null) field.original = field.value;
      field.value = value;
      field.editedByName = name;
      field.editedAt = new Date().toISOString();
      changed.push(field.row == null ? field.label : `${field.label}, row ${field.row + 1}`);
    }
    if (changed.length) {
      await db.query('UPDATE review_items SET fields = $2, updated_at = NOW() WHERE id = $1', [id, JSON.stringify(row.fields)]);
      await audit(db, req, { action: 'review.fields_edited', targetType: 'review_item', targetId: id, metadata: { title: row.title, fields: changed.slice(0, 50), count: changed.length } });
    }
    return view(db, req, row);
  });
  res.json({ item });
}));

const decide = (status) => catchAsync(async (req, res) => {
  const id = idParam(req);
  const reason = typeof req.body.reason === 'string' ? req.body.reason.trim().slice(0, 1000) : '';
  const name = personName(req.session);

  const item = await withOrg(req.session.orgId, async (db) => {
    const row = await load(db, id, true);
    if (row.status !== 'queued') throw coded(409, 'already_decided', `This document was already ${row.status}.`);
    const failing = runChecks(row.template, row.fields).filter((c) => c.blocking && c.status === 'fail');
    if (status === 'rejected' && reason.length < 3) throw coded(400, 'reason_required', 'Say why this document is rejected.');
    if (status === 'approved' && failing.length && reason.length < 10) {
      throw coded(409, 'checks_failing', 'A check is failing. Fix the fields, or approve with a written reason of at least 10 characters.', { checks: failing.map((c) => c.id) });
    }
    const overridden = status === 'approved' && failing.length > 0;
    await db.query(
      'UPDATE review_items SET status = $2, decided_by = $3, decided_by_name = $4, decided_at = NOW(), decision_reason = $5, updated_at = NOW() WHERE id = $1',
      [id, status, req.session.userId, name, status === 'rejected' || overridden ? reason : null]
    );
    await audit(db, req, {
      action: `review.${status}`, targetType: 'review_item', targetId: id,
      metadata: { title: row.title, by: name, ...(status === 'rejected' ? { reason } : {}), ...(overridden ? { overrode: failing.map((c) => c.label), reason } : {}) },
    });
    return view(db, req, await load(db, id));
  });
  res.json({ item });
});
router.post('/review/:id/approve', requirePermission('review.decide'), decide('approved'));
router.post('/review/:id/reject', requirePermission('review.decide'), decide('rejected'));

router.get('/review/:id/export', requirePermission('data.export'), catchAsync(async (req, res) => {
  const id = idParam(req);
  const format = req.query.format === 'json' ? 'json' : 'csv';
  const row = await withOrg(req.session.orgId, async (db) => {
    const found = await load(db, id);
    await audit(db, req, { action: 'review.exported', targetType: 'review_item', targetId: id, metadata: { title: found.title, format } });
    return found;
  });
  const name = `${row.title.replace(/[^\w.\- ]/g, '_').slice(0, 80)}.${format}`;
  res.set({ 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store' });
  if (format === 'json') return res.type('application/json').send(JSON.stringify({ ...detail(row), exportedAt: new Date().toISOString() }, null, 2));
  return res.type('text/csv').send(toCsv(row));
}));

module.exports = router;
