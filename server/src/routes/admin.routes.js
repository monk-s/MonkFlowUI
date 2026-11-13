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

module.exports = router;
