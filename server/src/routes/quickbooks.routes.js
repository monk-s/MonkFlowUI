const router = require('express').Router();
const { authenticate, optionalAuth } = require('../middleware/auth');
const requireSuperadmin = require('../middleware/requireSuperadmin');
const qboController = require('../controllers/quickbooks.controller');

// OAuth flow
router.get('/auth-url', authenticate, requireSuperadmin, qboController.getAuthUrl);
router.get('/callback', qboController.handleCallback); // No auth — OAuth redirect

// Status (any authenticated user)
router.get('/status', authenticate, qboController.getConnectionStatus);

// Superadmin operations
router.post('/sync-customer/:userId', authenticate, requireSuperadmin, qboController.syncCustomer);
router.post('/sync-all-customers', authenticate, requireSuperadmin, qboController.syncAllCustomers);
router.post('/generate-invoice/:userId', authenticate, requireSuperadmin, qboController.generateInvoice);
router.post('/send-invoice/:invoiceId', authenticate, requireSuperadmin, qboController.sendInvoice);

// Webhook (no auth — verified by Intuit signature)
router.post('/webhook', qboController.handleWebhook);

module.exports = router;
