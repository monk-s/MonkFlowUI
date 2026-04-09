const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const requireSuperadmin = require('../middleware/requireSuperadmin');
const ctrl = require('../controllers/linkedin.controller');

// Public webhook (Unipile signs payloads with HMAC) — must be BEFORE auth middleware
router.post('/webhook', ctrl.webhook);

// Everything else is superadmin-only
router.use(authenticate, requireSuperadmin);
router.post('/run', ctrl.runNow);
router.get('/leads', ctrl.listLeads);
router.get('/stats', ctrl.getStats);

module.exports = router;
