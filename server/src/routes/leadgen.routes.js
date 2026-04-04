const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const ctrl = require('../controllers/leadgen.controller');

// Public: unsubscribe link (no auth needed)
router.get('/unsubscribe/:token', ctrl.unsubscribe);

// Protected routes (admin-only — lead gen is a platform-level feature)
const requireSuperadmin = require('../middleware/requireSuperadmin');
router.get('/leads', authenticate, requireSuperadmin, ctrl.getLeads);
router.get('/stats', authenticate, requireSuperadmin, ctrl.getStats);
router.get('/leads/:id', authenticate, requireSuperadmin, ctrl.getLead);
router.post('/run', authenticate, requireSuperadmin, ctrl.triggerRun);

// Internal trigger via secret (for cron/manual without JWT)
router.post('/run-internal', (req, res, next) => {
  const secret = req.headers['x-cron-secret'] || req.query.secret;
  if (!secret || secret !== process.env.CRON_SECRET) {
    return res.status(403).json({ error: { message: 'Forbidden' } });
  }
  next();
}, ctrl.triggerRun);

module.exports = router;
