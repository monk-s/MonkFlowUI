const rateLimit = require('express-rate-limit');

// The API tests make hundreds of requests from one address in a few seconds.
// The local end-to-end suite does the same through one browser; it sets
// DISABLE_RATE_LIMITS=1, which is ignored in production.
const skip = () => process.env.NODE_ENV === 'test'
  || (process.env.NODE_ENV !== 'production' && process.env.DISABLE_RATE_LIMITS === '1');

const global = rateLimit({
  skip,
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: 'Too many requests, please try again later' } },
});

const auth = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: 'Too many auth attempts, please try again later' } },
});

const agentExecute = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.userId || req.ip,
  message: { error: { message: 'Agent execution rate limit reached' } },
});

const webhook = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.params.webhookId || req.ip,
  message: { error: { message: 'Webhook rate limit reached' } },
});

const clientErrorsGlobal = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: 'Too many error reports' } },
});

const clientErrorsPerIp = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
  message: { error: { message: 'Too many error reports from this IP' } },
});

// ── Portal v2 sign-in ─────────────────────────────────────────
// Reads the portal makes on every page load (session, config). Generous.
const sessionRead = rateLimit({
  skip,
  windowMs: 60 * 1000,
  max: 240,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: 'Too many requests, please try again shortly', details: { code: 'rate_limited' } } },
});

// Anything that tests a credential, a code or a token.
const signInAttempt = rateLimit({
  skip,
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: 'Too many attempts. Wait a minute and try again.', details: { code: 'rate_limited', retryAfterSeconds: 60 } } },
});

// Per account, whatever address the request came from: stops slow guessing
// against one mailbox from many IPs.
const signInPerEmail = rateLimit({
  skip,
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => 'email:' + String((req.body && req.body.email) || req.ip).trim().toLowerCase(),
  message: { error: { message: 'Too many attempts for this account. Wait 15 minutes, or reset your password.', details: { code: 'rate_limited', retryAfterSeconds: 900 } } },
});

module.exports = { sessionRead, signInAttempt, signInPerEmail, global, auth, agentExecute, webhook, clientErrorsGlobal, clientErrorsPerIp };
