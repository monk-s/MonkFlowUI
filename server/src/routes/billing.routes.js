const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const requireSuperadmin = require('../middleware/requireSuperadmin');
const billingController = require('../controllers/billing.controller');

router.use(authenticate);

// User-facing
router.get('/invoices', billingController.listMyInvoices);
router.get('/invoices/:id', billingController.getMyInvoice);

// Admin
router.get('/all-invoices', requireSuperadmin, billingController.listAllInvoices);

module.exports = router;
