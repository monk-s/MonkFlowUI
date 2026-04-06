const router = require('express').Router();
const ctrl = require('../controllers/outreach.controller');
const { authenticate } = require('../middleware/auth');
const requireSuperadmin = require('../middleware/requireSuperadmin');

// Resend bounce/complaint webhook — no auth (verified by Resend)
router.post('/webhook/resend', ctrl.handleResendWebhook);

// Inbound reply webhook — no auth (called by email forwarding services)
router.post('/webhook/inbound', ctrl.handleInboundReply);

// Open/click tracking — no auth (called by email clients)
router.get('/track/open/:emailId', ctrl.trackOpen);
router.get('/track/click/:emailId', ctrl.trackClick);

// All other outreach routes require auth + superadmin (platform-level feature)
router.use(authenticate);
router.use(requireSuperadmin);

router.get('/stats', ctrl.getStats);
router.get('/analytics', ctrl.getAnalytics);
router.get('/ab-results', ctrl.getAbResults);
router.get('/', ctrl.getLeads);
router.post('/', ctrl.createLead);
router.post('/process', ctrl.processDueFollowups);
router.post('/bulk-import', ctrl.bulkImport);
router.post('/generate-all', ctrl.generateAllAiEmails);

router.get('/:id', ctrl.getLead);
router.get('/:id/timeline', ctrl.getLeadTimeline);
router.put('/:id', ctrl.updateLead);
router.delete('/:id', ctrl.deleteLead);
router.post('/:id/mark-reply', ctrl.markReply);
router.get('/:id/preview', ctrl.previewFollowup);
router.post('/:id/toggle-priority', ctrl.togglePriority);
router.post('/:id/ai-generate', ctrl.generateAiEmail);
router.get('/:id/ai-preview', ctrl.previewAiEmail);
router.post('/:id/ai-send', ctrl.sendAiEmailEndpoint);

module.exports = router;
