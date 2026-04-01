const router = require('express').Router();
const ctrl = require('../controllers/outreach.controller');
const { authenticate } = require('../middleware/auth');

// All outreach routes require auth (superadmin enforced at app level)
router.use(authenticate);

router.get('/stats', ctrl.getStats);
router.get('/', ctrl.getLeads);
router.post('/', ctrl.createLead);
router.post('/process', ctrl.processDueFollowups);
router.post('/bulk-import', ctrl.bulkImport);
router.post('/generate-all', ctrl.generateAllAiEmails);

router.get('/:id', ctrl.getLead);
router.put('/:id', ctrl.updateLead);
router.delete('/:id', ctrl.deleteLead);
router.post('/:id/mark-reply', ctrl.markReply);
router.get('/:id/preview', ctrl.previewFollowup);
router.post('/:id/toggle-priority', ctrl.togglePriority);
router.post('/:id/ai-generate', ctrl.generateAiEmail);
router.get('/:id/ai-preview', ctrl.previewAiEmail);
router.post('/:id/ai-send', ctrl.sendAiEmailEndpoint);

module.exports = router;
