const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const invoiceModel = require('../models/invoice.model');
const billingService = require('../services/billing.service');
const { paginate, paginatedResponse } = require('../utils/pagination');
const env = require('../config/env');

const listMyInvoices = catchAsync(async (req, res) => {
  const { limit, offset, page } = paginate(req.query);
  const [invoices, total] = await Promise.all([
    invoiceModel.findByUser(req.user.userId, limit, offset),
    invoiceModel.countByUser(req.user.userId),
  ]);
  res.json(paginatedResponse(invoices, total, { page, limit }));
});

const getMyInvoice = catchAsync(async (req, res) => {
  const invoice = await invoiceModel.findById(req.params.id);
  if (!invoice || invoice.user_id !== req.user.userId) {
    throw ApiError.notFound('Invoice not found');
  }
  res.json({ data: invoice });
});

// Admin: list all invoices
const listAllInvoices = catchAsync(async (req, res) => {
  const invoices = await invoiceModel.findAll(50, 0);
  res.json({ data: invoices });
});

// Create Stripe Checkout session for plan upgrade
const createCheckout = catchAsync(async (req, res) => {
  const { planSlug } = req.body;
  if (!planSlug) throw ApiError.badRequest('planSlug is required');

  const result = await billingService.createCheckoutSession(req.user.userId, planSlug);
  res.json({ data: result });
});

// Create Stripe Customer Portal session
const createPortal = catchAsync(async (req, res) => {
  const result = await billingService.createPortalSession(req.user.userId);
  res.json({ data: result });
});

// Stripe webhook handler (no auth middleware — Stripe sends directly)
const handleWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  if (!sig) return res.status(400).json({ error: 'Missing stripe-signature header' });

  let event;
  try {
    const stripe = require('stripe')(env.stripeSecretKey);
    event = stripe.webhooks.constructEvent(req.rawBody || req.body, sig, env.stripeWebhookSecret);
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err.message);
    return res.status(400).json({ error: 'Webhook signature verification failed' });
  }

  try {
    await billingService.handleWebhook(event);
    res.json({ received: true });
  } catch (err) {
    console.error('Webhook handler error:', err.message);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
};

module.exports = { listMyInvoices, getMyInvoice, listAllInvoices, createCheckout, createPortal, handleWebhook };
