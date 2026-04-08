const env = require('../config/env');
const logger = require('../utils/logger');

const PUSHOVER_URL = 'https://api.pushover.net/1/messages.json';

/**
 * Send a push notification to Nathan's phone via Pushover.
 * No-ops silently if credentials missing (so dev/CI doesn't crash).
 * Never throws — caller code is never blocked by push failures.
 *
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} opts.message
 * @param {string} [opts.url]
 * @param {string} [opts.urlTitle]
 * @param {number} [opts.priority]  -2..2 (1 = high, bypass quiet hours)
 */
async function sendPush({ title, message, url, urlTitle, priority = 0 }) {
  if (!env.pushoverUserKey || !env.pushoverAppToken) {
    logger.debug('[pushover] skipped — no credentials configured');
    return { ok: false, reason: 'no_credentials' };
  }
  const body = new URLSearchParams({
    token: env.pushoverAppToken,
    user: env.pushoverUserKey,
    title: String(title || '').slice(0, 250),
    message: String(message || '').slice(0, 1024),
    priority: String(priority),
  });
  if (url) body.set('url', url);
  if (urlTitle) body.set('url_title', urlTitle);

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      const res = await fetch(PUSHOVER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (res.ok) return { ok: true };
      // Retry once on 5xx; bail on 4xx (bad token / bad payload)
      if (res.status >= 500 && attempt === 1) continue;
      const text = await res.text().catch(() => '');
      logger.warn({ status: res.status, body: text }, '[pushover] non-ok response');
      return { ok: false, status: res.status };
    } catch (err) {
      if (attempt === 1) continue;
      logger.warn({ err: err.message }, '[pushover] send failed');
      return { ok: false, reason: 'exception' };
    }
  }
}

module.exports = { sendPush };
