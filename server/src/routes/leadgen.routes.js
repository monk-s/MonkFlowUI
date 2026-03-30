const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const ctrl = require('../controllers/leadgen.controller');

// Public: unsubscribe link (no auth needed)
router.get('/unsubscribe/:token', ctrl.unsubscribe);

// Protected routes
router.get('/leads', authenticate, ctrl.getLeads);
router.get('/stats', authenticate, ctrl.getStats);
router.get('/leads/:id', authenticate, ctrl.getLead);
router.post('/run', authenticate, ctrl.triggerRun);

module.exports = router;
