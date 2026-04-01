const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const qboService = require('../services/quickbooks.service');
const qboModel = require('../models/qbo.model');
const invoiceModel = require('../models/invoice.model');
const invoiceService = require('../services/invoice.service');
const { query } = require('../config/database');
const env = require('../config/env');

const getAuthUrl = catchAsync(async (req, res) => {
  const url = qboService.getAuthUrl(req.user.userId);
  res.json({ data: { url } });
});

const handleCallback = catchAsync(async (req, res) => {
  const { code, realmId, state } = req.query;
  if (!code || !realmId) throw ApiError.badRequest('Missing code or realmId from Intuit');

  const tokens = await qboService.exchangeCode(code, realmId);
  const expiresAt = new Date(Date.now() + tokens.expiresIn * 1000);

  // Try to get company name
  let companyName = null;
  try {
    const info = await qboService.getCompanyInfo(tokens.accessToken, realmId);
    companyName = info.CompanyName;
  } catch (e) { /* non-critical */ }

  // The state param contains the userId
  const userId = state || (req.user && req.user.userId);
  if (!userId) throw ApiError.badRequest('Could not determine user for QBO connection');

  await qboModel.upsertConnection(userId, {
    realmId,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    tokenExpiresAt: expiresAt,
    companyName,
  });

  // Redirect back to frontend integrations page
  const frontendUrl = env.frontendUrl || 'https://monkflow.io';
  res.redirect(`${frontendUrl}/#integrations?qbo=connected`);
});

const getConnectionStatus = catchAsync(async (req, res) => {
  const connection = await qboModel.findConnection(req.user.userId);
  res.json({
    data: {
      connected: !!connection,
      companyName: connection?.company_name || null,
      connectedAt: connection?.connected_at || null,
    },
  });
});

const syncCustomer = catchAsync(async (req, res) => {
  const { userId } = req.params;
  const connection = await qboModel.findConnection(req.user.userId);
  if (!connection) throw ApiError.badRequest('QuickBooks not connected');

  const accessToken = await qboService.ensureValidToken(connection);

  // Get user data
  const { rows } = await query('SELECT id, email, first_name, last_name, company FROM users WHERE id = $1', [userId]);
  const user = rows[0];
  if (!user) throw ApiError.notFound('User not found');

  const customer = await qboService.createCustomer(accessToken, connection.realm_id, {
    email: user.email,
    firstName: user.first_name,
    lastName: user.last_name,
    company: user.company,
  });

  await qboModel.upsertCustomerMap(userId, customer.Id, customer.DisplayName);

  res.json({ data: { customerId: customer.Id, displayName: customer.DisplayName } });
});

const syncAllCustomers = catchAsync(async (req, res) => {
  const connection = await qboModel.findConnection(req.user.userId);
  if (!connection) throw ApiError.badRequest('QuickBooks not connected');

  const accessToken = await qboService.ensureValidToken(connection);
  const { rows: users } = await query("SELECT id, email, first_name, last_name, company FROM users WHERE role != 'superadmin'");

  let synced = 0;
  const errors = [];
  for (const user of users) {
    try {
      // Check if already mapped
      const existing = await qboModel.findCustomerMap(user.id);
      if (existing) { synced++; continue; }

      const customer = await qboService.createCustomer(accessToken, connection.realm_id, {
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        company: user.company,
      });
      await qboModel.upsertCustomerMap(user.id, customer.Id, customer.DisplayName);
      synced++;
    } catch (err) {
      errors.push({ userId: user.id, email: user.email, error: err.message });
    }
  }

  res.json({ data: { synced, total: users.length, errors } });
});

const generateInvoice = catchAsync(async (req, res) => {
  const { userId } = req.params;
  const { periodStart, periodEnd } = req.body;
  if (!periodStart || !periodEnd) throw ApiError.badRequest('periodStart and periodEnd required');

  const invoice = await invoiceService.generateMonthlyInvoice(userId, periodStart, periodEnd);
  res.json({ data: invoice });
});

const sendInvoice = catchAsync(async (req, res) => {
  const { invoiceId } = req.params;
  const invoice = await invoiceModel.findById(invoiceId);
  if (!invoice) throw ApiError.notFound('Invoice not found');
  if (!invoice.qbo_invoice_id) throw ApiError.badRequest('Invoice not synced to QuickBooks');

  const connection = await qboModel.findConnection(req.user.userId);
  if (!connection) throw ApiError.badRequest('QuickBooks not connected');

  const accessToken = await qboService.ensureValidToken(connection);

  // Get user email for sending
  const { rows } = await query('SELECT email FROM users WHERE id = $1', [invoice.user_id]);
  const userEmail = rows[0]?.email;

  await qboService.sendInvoice(accessToken, connection.realm_id, invoice.qbo_invoice_id, userEmail);

  await invoiceModel.update(invoiceId, { status: 'sent', sent_at: new Date() });

  res.json({ data: { sent: true, invoiceId } });
});

const handleWebhook = catchAsync(async (req, res) => {
  // Intuit webhook verification would go here (HMAC-SHA256)
  // For now, process payment notifications
  const events = req.body.eventNotifications || [];
  for (const event of events) {
    const entities = event.dataChangeEvent?.entities || [];
    for (const entity of entities) {
      if (entity.name === 'Payment' && entity.operation === 'Create') {
        // A payment was made — find matching invoice and mark as paid
        // Would need to query QBO for the payment details to find the invoice
        console.log(`[QBO Webhook] Payment created: ${entity.id}`);
      }
    }
  }
  res.status(200).json({ ok: true });
});

module.exports = {
  getAuthUrl, handleCallback, getConnectionStatus,
  syncCustomer, syncAllCustomers,
  generateInvoice, sendInvoice, handleWebhook,
};
