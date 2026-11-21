/**
 * /api/v1/portal/audit — the workspace's audit log, for people who hold
 * audit.view (admins and auditors). Follows the rules at the top of ./index.js.
 * Read-only: the table itself refuses updates and deletes (migration 051).
 */
const router = require('express').Router();
const catchAsync = require('../../utils/catchAsync');
const { requirePermission } = require('../../middleware/session');
const { withOrg } = require('../../portal/withOrg');
const { audit } = require('../../portal/audit');
const { csvCell } = require('../../portal/review');

const PAGE = 50;
const EXPORT_MAX = 10000;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

// Shared by the list and the export, so a file always matches the screen.
function filter(query) {
  const where = [];
  const params = [];
  const add = (sql, value) => { params.push(value); where.push(sql.replaceAll('?', `$${params.length}`)); };
  const q = String(query.q || '').trim().slice(0, 100);
  if (q) add('(a.actor_email ILIKE ? OR a.action ILIKE ?)', `%${q.replace(/[\\%_]/g, '\\$&')}%`);
  if (DAY.test(query.from || '')) add('a.created_at >= ?::date', query.from);
  if (DAY.test(query.to || '')) add("a.created_at < ?::date + 1", query.to);
  if (/^\d{1,18}$/.test(query.before || '')) add('a.id < ?', query.before);
  return { where: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

const SELECT = `SELECT a.id, a.created_at, a.action, a.actor_email, a.actor_role, a.target_type, a.target_id, a.metadata, a.ip,
                       m.first_name, m.last_name
                  FROM audit_log a LEFT JOIN org_members m ON m.user_id = a.actor_user_id`;

const view = (r) => ({
  id: String(r.id), at: r.created_at, action: r.action,
  actor: r.actor_role === 'monkflow_staff' ? 'MonkFlow' : (`${r.first_name || ''} ${r.last_name || ''}`.trim() || r.actor_email || 'System'),
  actorEmail: r.actor_email, actorRole: r.actor_role,
  target: r.target_type ? `${r.target_type} ${r.target_id || ''}`.trim() : '',
  detail: Object.entries(r.metadata || {}).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(', '),
  ip: r.ip,
});

// Recompute every row's hash the way the insert trigger did (migration 051)
// and check each row points at the one before it. Any edit, deletion or
// reordering inside the workspace's log shows up as a broken row.
const CHAIN = `
  SELECT count(*)::int AS entries,
         count(*) FILTER (WHERE row_hash <> want OR prev_hash IS DISTINCT FROM lag_hash)::int AS broken
    FROM (SELECT row_hash, prev_hash, lag(row_hash) OVER (ORDER BY id) AS lag_hash,
                 encode(digest(
                   COALESCE(prev_hash, '') || '|' || org_id::text || '|' ||
                   COALESCE(actor_user_id::text, '') || '|' || COALESCE(actor_email, '') || '|' ||
                   COALESCE(actor_role, '') || '|' || action || '|' ||
                   COALESCE(target_type, '') || '|' || COALESCE(target_id, '') || '|' ||
                   metadata::text || '|' || created_at::text, 'sha256'), 'hex') AS want
            FROM audit_log) t`;

router.get('/audit', requirePermission('audit.view'), catchAsync(async (req, res) => {
  const f = filter(req.query);
  const out = await withOrg(req.session.orgId, async (db) => ({
    rows: (await db.query(`${SELECT} ${f.where} ORDER BY a.id DESC LIMIT ${PAGE + 1}`, f.params)).rows,
    // The whole chain is checked once, with the first page.
    chain: req.query.before ? null : (await db.query(CHAIN)).rows[0],
  }));
  const rows = out.rows.slice(0, PAGE);
  res.json({
    entries: rows.map(view),
    nextBefore: out.rows.length > PAGE ? String(rows[rows.length - 1].id) : null,
    chain: out.chain && { ok: out.chain.broken === 0, entries: out.chain.entries },
  });
}));

router.get('/audit/export', requirePermission('audit.view'), catchAsync(async (req, res) => {
  const f = filter({ ...req.query, before: '' });
  const rows = await withOrg(req.session.orgId, async (db) => {
    const found = (await db.query(`${SELECT} ${f.where} ORDER BY a.id DESC LIMIT ${EXPORT_MAX}`, f.params)).rows;
    await audit(db, req, { action: 'audit.exported', metadata: { entries: found.length, q: String(req.query.q || '').slice(0, 100), from: req.query.from || '', to: req.query.to || '' } });
    return found;
  });
  const lines = [['Time (UTC)', 'Person', 'Email', 'Role', 'Action', 'Target', 'Detail', 'IP address'],
    ...rows.map(view).map((e) => [new Date(e.at).toISOString(), e.actor, e.actorEmail, e.actorRole, e.action, e.target, e.detail, e.ip])];
  res.set({ 'Content-Disposition': `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.csv"`, 'Cache-Control': 'no-store' });
  res.type('text/csv').send(lines.map((l) => l.map(csvCell).join(',')).join('\r\n') + '\r\n');
}));

module.exports = router;
