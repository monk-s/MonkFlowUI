const env = require('../config/env');

const STONKBOT_URL = process.env.STONKBOT_URL || 'http://localhost:3001';
const STONKBOT_API_KEY = process.env.STONKBOT_API_KEY || 'dev-key';
const ALLOWED_EMAILS = (process.env.STONKBOT_ALLOWED_EMAILS || 'nathan@monkflow.io,jake@thelinders.com').split(',').map(e => e.trim());

async function proxyGet(endpoint, req, res) {
  if (req.user.role !== 'superadmin' && !ALLOWED_EMAILS.includes(req.user.email)) {
    return res.status(403).json({ error: 'Access denied' });
  }
  try {
    const url = `${STONKBOT_URL}${endpoint}${req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : ''}`;
    const response = await fetch(url, {
      headers: { 'X-Bot-Key': STONKBOT_API_KEY, 'bypass-tunnel-reminder': 'true' },
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    res.status(502).json({ error: 'Stonk Bot unreachable', details: err.message });
  }
}

async function proxyPost(endpoint, req, res) {
  if (!ALLOWED_EMAILS.includes(req.user.email)) {
    return res.status(403).json({ error: 'Access denied' });
  }
  try {
    const response = await fetch(`${STONKBOT_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Bot-Key': STONKBOT_API_KEY,
        'bypass-tunnel-reminder': 'true',
      },
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    res.status(502).json({ error: 'Stonk Bot unreachable', details: err.message });
  }
}

exports.getStatus = (req, res) => proxyGet('/status', req, res);
exports.getAccount = (req, res) => proxyGet('/account', req, res);
exports.getPositions = (req, res) => proxyGet('/positions', req, res);
exports.getTrades = (req, res) => proxyGet('/trades', req, res);
exports.getPnl = (req, res) => proxyGet('/pnl', req, res);
exports.getSignals = (req, res) => proxyGet('/signals', req, res);
exports.getConfig = (req, res) => proxyGet('/config', req, res);
exports.postControl = (req, res) => proxyPost('/control', req, res);
