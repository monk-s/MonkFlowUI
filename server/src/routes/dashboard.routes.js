const router = require('express').Router();
const dashboardController = require('../controllers/dashboard.controller');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);
router.get('/stats', dashboardController.getStats);
router.get('/analytics', dashboardController.getAnalytics);

module.exports = router;
