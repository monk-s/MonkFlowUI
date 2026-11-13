const jwt = require('jsonwebtoken');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const { loadSession, COOKIE, parseCookies } = require('../services/session.service');

/**
 * Authentication for the existing (pre-portal-v2) API routes.
 *
 * Two ways in:
 *   1. The portal session cookie (services/session.service.js). This is how
 *      browsers authenticate now.
 *   2. A Bearer JWT, as before. Still accepted so API clients and a browser
 *      running the previous app.js keep working during the changeover.
 *
 * Either way the route sees the same req.user = { userId, email, role }.
 */
const fromBearer = (req) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, env.jwtSecret);
    return { userId: payload.userId, email: payload.email, role: payload.role };
  } catch (err) {
    if (err.name === 'TokenExpiredError') throw ApiError.unauthorized('Token expired');
    throw ApiError.unauthorized('Invalid token');
  }
};

const fromCookie = async (req) => {
  if (!parseCookies(req.headers.cookie)[COOKIE]) return null;
  const session = await loadSession(req, { touch: req.headers['x-mf-background'] !== '1' });
  if (!session) return null;
  req.session = session;
  return { userId: session.userId, email: session.email, role: session.legacyRole };
};

const authenticate = async (req, res, next) => {
  try {
    const user = fromBearer(req) || await fromCookie(req);
    if (!user) throw ApiError.unauthorized('Missing or invalid authorization header');
    req.user = user;
    next();
  } catch (err) { next(err); }
};

const optionalAuth = async (req, res, next) => {
  try {
    let user = null;
    try { user = fromBearer(req); } catch { /* invalid token: proceed without auth */ }
    if (!user) user = await fromCookie(req).catch(() => null);
    if (user) req.user = user;
  } catch { /* proceed without auth */ }
  next();
};

module.exports = { authenticate, optionalAuth };
