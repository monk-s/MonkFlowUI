/**
 * /api/v1/portal — engagement tracker, action queue and activity.
 * Follows the rules at the top of ./index.js.
 *
 * Clients read the tracker and do two things to it: sign off a milestone
 * MonkFlow has marked ready, and mark a request from MonkFlow as done.
 * Everything else about an engagement is edited by MonkFlow staff
 * (controllers/engagement.controller.js).
 */
const router = require('express').Router();
const catchAsync = require('../../utils/catchAsync');
const ApiError = require('../../utils/ApiError');
const { requirePermission, coded } = require('../../middleware/session');
const { withOrg, UUID } = require('../../portal/withOrg');
const { audit } = require('../../portal/audit');
const { can } = require('../../portal/permissions');
const { engagementView, actionItemView, activitySummary, day } = require('../../portal/engagements');

const idParam = (req) => {
  if (!UUID.test(req.params.id)) throw ApiError.notFound('Not found');
  return req.params.id;
};
const personName = (s) => `${s.firstName || ''} ${s.lastName || ''}`.trim() || s.email;

router.get('/engagements', requirePermission('overview.view'), catchAsync(async (req, res) => {
  const data = await withOrg(req.session.orgId, async (db) => ({
    engagements: (await db.query('SELECT * FROM engagements ORDER BY created_at, id')).rows,
    milestones: (await db.query('SELECT * FROM milestones ORDER BY position, created_at, id')).rows,
  }));
  res.json({ engagements: data.engagements.map((e) => engagementView(e, data.milestones)) });
}));

router.post('/milestones/:id/sign-off', requirePermission('engagement.signoff'), catchAsync(async (req, res) => {
  const id = idParam(req);
  const name = personName(req.session);
  const milestone = await withOrg(req.session.orgId, async (db) => {
    const current = (await db.query('SELECT id, title, status, engagement_id FROM milestones WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!current) throw ApiError.notFound('Not found');
    if (current.status !== 'awaiting_signoff') {
      throw coded(409, 'not_awaiting_signoff', current.status === 'complete' ? 'This milestone is already complete.' : 'This milestone is not ready for sign-off yet.');
    }
    const { rows } = await db.query(
      `UPDATE milestones SET status = 'complete', signed_off_by = $2, signed_off_by_name = $3, signed_off_at = NOW(), updated_at = NOW()
        WHERE id = $1 RETURNING *`,
      [id, req.session.userId, name]
    );
    await audit(db, req, {
      action: 'engagement.milestone_signed_off', targetType: 'milestone', targetId: id,
      metadata: { title: current.title, engagementId: current.engagement_id, signedOffBy: name },
    });
    return rows[0];
  });
  res.json({ milestone: { id: milestone.id, status: milestone.status, signedOffByName: milestone.signed_off_by_name, signedOffAt: milestone.signed_off_at } });
}));

// What is waiting on the client: milestones ready for sign-off, then open
// requests from MonkFlow. Soonest due first, undated last.
router.get('/actions', requirePermission('overview.view'), catchAsync(async (req, res) => {
  const data = await withOrg(req.session.orgId, async (db) => ({
    signoffs: (await db.query(
      `SELECT m.id, m.title, m.detail, m.due_on, m.engagement_id, e.name AS engagement_name
         FROM milestones m JOIN engagements e ON e.id = m.engagement_id
        WHERE m.status = 'awaiting_signoff'`
    )).rows,
    items: (await db.query(
      `SELECT a.*, e.name AS engagement_name
         FROM action_items a LEFT JOIN engagements e ON e.id = a.engagement_id
        WHERE a.status = 'open' AND a.origin = 'monkflow'`
    )).rows,
  }));
  const signOff = can(req.session.role, 'engagement.signoff');
  const complete = can(req.session.role, 'actions.complete');
  const actions = [
    ...data.signoffs.map((m) => ({
      id: m.id, kind: 'signoff', title: m.title, detail: m.detail, dueOn: day(m.due_on),
      engagementId: m.engagement_id, engagementName: m.engagement_name, canAct: signOff,
    })),
    ...data.items.map((a) => ({ ...actionItemView(a), engagementName: a.engagement_name, canAct: complete })),
  ].sort((a, b) => (a.dueOn || '9999').localeCompare(b.dueOn || '9999') || a.title.localeCompare(b.title));
  res.json({ actions });
}));

router.post('/actions/:id/complete', requirePermission('actions.complete'), catchAsync(async (req, res) => {
  const id = idParam(req);
  const name = personName(req.session);
  await withOrg(req.session.orgId, async (db) => {
    const current = (await db.query("SELECT id, title, status FROM action_items WHERE id = $1 AND origin = 'monkflow' FOR UPDATE", [id])).rows[0];
    if (!current) throw ApiError.notFound('Not found');
    if (current.status !== 'open') throw coded(409, 'not_open', 'This request is no longer open.');
    await db.query(
      "UPDATE action_items SET status = 'done', completed_by = $2, completed_by_name = $3, completed_at = NOW(), updated_at = NOW() WHERE id = $1",
      [id, req.session.userId, name]
    );
    await audit(db, req, { action: 'action.completed', targetType: 'action_item', targetId: id, metadata: { title: current.title, completedBy: name } });
  });
  res.json({ ok: true });
}));

// Engagement events only. The full audit log is a separate permission.
router.get('/activity', requirePermission('overview.view'), catchAsync(async (req, res) => {
  const rows = await withOrg(req.session.orgId, async (db) => (await db.query(
    `SELECT a.id, a.action, a.metadata, a.created_at, a.actor_role, a.actor_email, m.first_name, m.last_name
       FROM audit_log a LEFT JOIN org_members m ON m.user_id = a.actor_user_id
      WHERE a.action LIKE 'engagement.%' OR a.action LIKE 'action.%'
      ORDER BY a.id DESC LIMIT 12`
  )).rows);
  res.json({
    activity: rows.map((r) => ({
      id: String(r.id), at: r.created_at, action: r.action, summary: activitySummary(r.action, r.metadata),
      actor: r.actor_role === 'monkflow_staff' ? 'MonkFlow' : (`${r.first_name || ''} ${r.last_name || ''}`.trim() || r.actor_email || 'Someone'),
    })),
  });
}));

module.exports = router;
