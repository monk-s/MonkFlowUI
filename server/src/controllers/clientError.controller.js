const catchAsync = require('../utils/catchAsync');
const { query } = require('../config/database');
const logger = require('../utils/logger');

const MAX_BODY = 5120;

function truncate(v, n) {
  if (v == null) return null;
  const s = String(v);
  return s.length > n ? s.slice(0, n) : s;
}

const reportError = catchAsync(async (req, res) => {
  try {
    const raw = JSON.stringify(req.body || {});
    if (raw.length > MAX_BODY) {
      return res.status(413).json({ error: { message: 'Payload too large' } });
    }
  } catch {
    return res.status(400).json({ error: { message: 'Invalid JSON' } });
  }

  const message = truncate(req.body && req.body.message, 2000);
  if (!message) return res.status(400).json({ error: { message: 'message required' } });

  const stack = truncate(req.body && req.body.stack, 8000);
  const url = truncate(req.body && req.body.url, 1000);
  const userAgent = truncate(req.body && req.body.userAgent, 1000);
  const userId = (req.user && req.user.userId) ? req.user.userId : null;
  const ip = req.ip || null;

  try {
    await query(
      `INSERT INTO client_errors (user_id, message, stack, url, user_agent, ip)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, message, stack, url, userAgent, ip]
    );
  } catch (err) {
    logger.warn({ msg: 'client_error_insert_failed', err: err.message });
  }
  logger.warn({ msg: 'client_error', message, url });

  res.json({ ok: true });
});

module.exports = { reportError };
