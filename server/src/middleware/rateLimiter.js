const rateLimit = require('express-rate-limit');

const global = rateLimit({
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

module.exports = { global, auth, agentExecute, webhook, clientErrorsGlobal, clientErrorsPerIp };
