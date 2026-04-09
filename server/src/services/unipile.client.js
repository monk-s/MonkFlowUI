// Thin Unipile REST wrapper for LinkedIn outreach.
// Docs: https://developer.unipile.com/reference
//
// Unipile is a hosted "messaging API" that brokers a real LinkedIn session
// without requiring us to scrape or run a headless browser. Lower ban risk,
// stable webhooks for accepts/replies. ~$39/mo Messaging API plan.
//
// All mutating calls enforce a 3-second delay between operations to avoid
// LinkedIn rate-flagging. Read-only calls (search/profile) are not throttled.

const env = require('../config/env');
const logger = require('../utils/logger');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let lastMutationAt = 0;
const MUTATION_DELAY_MS = 3000;

function baseUrl() {
  if (!env.unipileDsn) throw new Error('UNIPILE_DSN not configured');
  // Unipile DSNs look like: api3.unipile.com:13334 — caller passes the full host:port
  return `https://${env.unipileDsn}/api/v1`;
}

async function call(method, path, body) {
  if (!env.unipileApiKey) {
    throw new Error('UNIPILE_API_KEY not configured');
  }
  const url = `${baseUrl()}${path}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    const res = await fetch(url, {
      method,
      headers: {
        'X-API-KEY': env.unipileApiKey,
        'Accept': 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
    if (!res.ok) {
      const err = new Error(`Unipile ${method} ${path} failed: ${res.status} ${text.slice(0, 200)}`);
      err.status = res.status;
      err.body = data;
      throw err;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function throttleMutation() {
  const since = Date.now() - lastMutationAt;
  if (since < MUTATION_DELAY_MS) {
    await sleep(MUTATION_DELAY_MS - since);
  }
  lastMutationAt = Date.now();
}

// ── Read-only ─────────────────────────────────────────────

async function listAccounts() {
  return call('GET', '/accounts');
}

/**
 * Search LinkedIn for people matching company / title / location.
 * Returns up to `limit` profiles.
 */
async function searchPeople({ keywords, location, limit = 10 }) {
  if (!env.unipileAccountId) throw new Error('UNIPILE_ACCOUNT_ID not configured');
  const body = {
    api: 'classic',
    category: 'people',
    keywords: [keywords, location].filter(Boolean).join(' '),
    limit: Math.min(limit, 25),
  };
  return call('POST', `/linkedin/search?account_id=${encodeURIComponent(env.unipileAccountId)}`, body);
}

async function getProfile(providerId) {
  if (!env.unipileAccountId) throw new Error('UNIPILE_ACCOUNT_ID not configured');
  return call('GET', `/users/${encodeURIComponent(providerId)}?account_id=${env.unipileAccountId}`);
}

// ── Mutating ──────────────────────────────────────────────

async function sendConnectionRequest(providerId, note) {
  await throttleMutation();
  return call('POST', '/users/invite', {
    account_id: env.unipileAccountId,
    provider_id: providerId,
    message: (note || '').slice(0, 280),
  });
}

async function sendMessage({ chatId, providerId, text }) {
  await throttleMutation();
  if (chatId) {
    return call('POST', `/chats/${encodeURIComponent(chatId)}/messages`, {
      account_id: env.unipileAccountId,
      text,
    });
  }
  // No chat exists yet — start a new DM thread to a profile
  return call('POST', '/chats', {
    account_id: env.unipileAccountId,
    attendees_ids: [providerId],
    text,
  });
}

// ── Webhook signature verification ────────────────────────
// Unipile signs webhooks with HMAC-SHA256 of the raw body using a shared secret.
function verifyWebhookSignature(rawBody, signatureHeader) {
  if (!env.unipileWebhookSecret) {
    logger.warn('[unipile] webhook secret not configured — accepting unverified payload');
    return true;
  }
  if (!signatureHeader) return false;
  const crypto = require('crypto');
  const expected = crypto.createHmac('sha256', env.unipileWebhookSecret).update(rawBody).digest('hex');
  // Constant-time compare
  try {
    return crypto.timingSafeEqual(Buffer.from(signatureHeader, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

module.exports = {
  listAccounts,
  searchPeople,
  getProfile,
  sendConnectionRequest,
  sendMessage,
  verifyWebhookSignature,
};
