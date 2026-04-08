const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const requireSuperadmin = require('../middleware/requireSuperadmin');
const adminController = require('../controllers/admin.controller');

router.use(authenticate, requireSuperadmin);

router.get('/stats', adminController.getPlatformStats);
router.get('/accounts', adminController.getAccounts);
router.get('/accounts/:userId', adminController.getAccountDetail);
router.get('/cost-analytics', adminController.getCostAnalytics);
router.get('/alerts', adminController.getAlerts);
router.get('/scheduler-health', adminController.getSchedulerHealth);
router.get('/client-errors', adminController.getClientErrors);
router.get('/reply-triage', adminController.getReplyTriage);
router.patch('/reply-triage/:id', adminController.updateReplyTriage);

module.exports = router;
