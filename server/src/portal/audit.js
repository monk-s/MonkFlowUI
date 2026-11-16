/**
 * Write one row to the append-only audit log (migration 051).
 *
 *   await audit(db, req, { action: 'team.role_changed', targetType: 'membership',
 *                          targetId: id, metadata: { from: 'reviewer', to: 'admin' } });
 *
 * `db` is the client from withOrg() when the action happens inside a
 * workspace transaction (so the log entry commits or rolls back with the
 * change it describes), or null to use the pool for events that have no
 * workspace transaction, such as signing in.
 *
 * Action names are "<area>.<verb_past>": auth.signed_in, invitation.sent,
 * team.member_removed. Never put secrets or document contents in metadata.
 */
const { query } = require('../config/database');

function actorFrom(req) {
  const s = (req && req.session) || {};
  return {
    orgId: s.orgId || null,
    userId: s.userId || null,
    email: s.email || null,
    role: s.role || (s.isPlatformAdmin ? 'monkflow_staff' : null),
  };
}

async function audit(db, req, entry) {
  const a = actorFrom(req);
  const params = [
    entry.orgId !== undefined ? entry.orgId : a.orgId,
    entry.actorUserId !== undefined ? entry.actorUserId : a.userId,
    entry.actorEmail !== undefined ? entry.actorEmail : a.email,
    entry.actorRole !== undefined ? entry.actorRole : a.role,
    entry.action,
    entry.targetType || null,
    entry.targetId != null ? String(entry.targetId) : null,
    JSON.stringify(entry.metadata || {}),
    (req && req.ip) || null,
    (req && req.headers && String(req.headers['user-agent'] || '').slice(0, 400)) || null,
  ];
  const sql = `INSERT INTO audit_log
      (org_id, actor_user_id, actor_email, actor_role, action, target_type, target_id, metadata, ip, user_agent)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`;
  return db ? db.query(sql, params) : query(sql, params);
}

module.exports = { audit };
