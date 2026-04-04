const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const requireSuperadmin = require('../middleware/requireSuperadmin');
const billingController = require('../controllers/billing.controller');

// Stripe webhook — must be before authenticate middleware (Stripe sends these directly)
router.post('/webhook', billingController.handleWebhook);

// All other routes require authentication
router.use(authenticate);

// User-facing
router.get('/invoices', billingController.listMyInvoices);
router.get('/invoices/:id', billingController.getMyInvoice);
router.post('/checkout', billingController.createCheckout);
router.post('/portal', billingController.createPortal);

// Admin
router.get('/all-invoices', requireSuperadmin, billingController.listAllInvoices);

module.exports = router;
