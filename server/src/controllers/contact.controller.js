const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const { query } = require('../config/database');

const submit = catchAsync(async (req, res) => {
  const { name, email, subject, message } = req.body;
  if (!name || !email || !subject || !message) {
    throw ApiError.badRequest('All fields are required: name, email, subject, message');
  }

  const userId = req.user?.userId || null;

  const { rows } = await query(
    `INSERT INTO contact_messages (user_id, name, email, subject, message) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [userId, name, email, subject, message]
  );

  // Send receipt email
  try {
    const emailService = require('../services/email.service');
    await emailService.sendContactFormReceipt(email, name, subject);
  } catch (err) {
    console.error('Failed to send contact receipt:', err.message);
  }

  res.status(201).json({ data: rows[0], message: 'Message sent successfully' });
});

module.exports = { submit };
