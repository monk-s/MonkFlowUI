const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const requireSuperadmin = require('../middleware/requireSuperadmin');
const adminController = require('../controllers/admin.controller');

const { sameOrigin } = require('../middleware/session');

router.use(sameOrigin, authenticate, requireSuperadmin);

router.get('/stats', adminController.getPlatformStats);
router.get('/accounts', adminController.getAccounts);
router.get('/accounts/:userId', adminController.getAccountDetail);
router.get('/cost-analytics', adminController.getCostAnalytics);
router.get('/alerts', adminController.getAlerts);
router.get('/scheduler-health', adminController.getSchedulerHealth);
router.get('/client-errors', adminController.getClientErrors);
router.get('/reply-triage', adminController.getReplyTriage);
router.patch('/reply-triage/:id', adminController.updateReplyTriage);

// Portal v2: workspaces (organizations). Creating one and inviting its first
// admin is how a new client gets access; there is no self-serve signup.
const organizations = require('../controllers/organization.controller');
router.get('/organizations', organizations.list);
router.post('/organizations', organizations.create);
router.patch('/organizations/:id', organizations.update);
router.post('/organizations/:id/invitations', organizations.invite);

// Portal v2 phase 2: the client's engagement tracker, requests and baselines.
const engagement = require('../controllers/engagement.controller');
router.get('/organizations/:id/engagement', engagement.get);
router.post('/organizations/:id/engagements', engagement.createEngagement);
router.patch('/organizations/:id/engagements/:eid', engagement.updateEngagement);
router.post('/organizations/:id/engagements/:eid/milestones', engagement.createMilestone);
router.patch('/organizations/:id/milestones/:mid', engagement.updateMilestone);
router.delete('/organizations/:id/milestones/:mid', engagement.removeMilestone);
router.post('/organizations/:id/actions', engagement.createAction);
router.delete('/organizations/:id/actions/:aid', engagement.withdrawAction);
router.post('/organizations/:id/workflows', engagement.attachWorkflow);
router.patch('/organizations/:id/workflows/:wid', engagement.setBaseline);
// Phase 3: keys a client's pipeline uses to post documents for review.
router.post('/organizations/:id/ingest-keys', engagement.createIngestKey);
router.delete('/organizations/:id/ingest-keys/:kid', engagement.revokeIngestKey);

module.exports = router;
