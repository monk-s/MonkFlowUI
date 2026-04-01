const catchAsync = require('../utils/catchAsync');
const invoiceModel = require('../models/invoice.model');
const { paginate, paginatedResponse } = require('../utils/pagination');

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
    const ApiError = require('../utils/ApiError');
    throw ApiError.notFound('Invoice not found');
  }
  res.json({ data: invoice });
});

// Admin: list all invoices
const listAllInvoices = catchAsync(async (req, res) => {
  const invoices = await invoiceModel.findAll(50, 0);
  res.json({ data: invoices });
});

module.exports = { listMyInvoices, getMyInvoice, listAllInvoices };
