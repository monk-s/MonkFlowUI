/**
 * Cookie-session middleware for the portal API.
 *
 *   requireSession              signed in (any state)
 *   requireOrg                  signed in AND working in a workspace
 *   requirePermission('x.y')    ...AND the role is allowed to do x.y
 *   requirePlatformAdmin        MonkFlow staff
 *   sameOrigin                  refuses cross-site writes (CSRF)
 *
 * A request sent with the header `X-MF-Background: 1` (polling, refetch on
 * focus) is authenticated but does not count as activity, so an unattended
 * tab still times out.
 */
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const { loadSession } = require('../services/session.service');
const { can } = require('../portal/permissions');
const { identity } = require('../services/identity');

function coded(status, code, message, extra) {
  const err = new ApiError(status, message, { code, ...(extra || {}) });
  err.code = code;
  return err;
}

const requireSession = async (req, res, next) => {
  try {
    const touch = req.headers['x-mf-background'] !== '1';
    const session = await loadSession(req, { touch });
    if (!session) return next(coded(401, 'not_signed_in', 'Your session has ended. Sign in again.'));
    req.session = session;
    // Shape the legacy controllers expect.
    req.user = { userId: session.userId, email: session.email, role: session.legacyRole };
    next();
  } catch (err) { next(err); }
};

const requireOrg = [requireSession, (req, res, next) => {
  if (!req.session.orgId) return next(coded(409, 'no_workspace_selected', 'Choose a workspace to continue.'));
  // Password sign-ins must finish adding a second factor before they can
  // read workspace data, when the identity provider supports one.
  if (identity().capabilities.mfa && req.session.authMethod === 'password' && !req.session.mfaVerified) {
    return next(coded(403, 'mfa_setup_required', 'Finish setting up two-step sign-in to continue.'));
  }
  next();
}];

const requirePermission = (permission) => [...requireOrg, (req, res, next) => {
  // 404, not 403: the portal does not confirm that something exists to
  // someone who may not see it.
  if (!can(req.session.role, permission)) return next(ApiError.notFound('Not found'));
  next();
}];

const requirePlatformAdmin = [requireSession, (req, res, next) => {
  if (!req.session.isPlatformAdmin) return next(ApiError.notFound('Not found'));
  next();
}];

// Origins a browser may send state-changing requests from.
function allowedOrigins() {
  const list = new Set();
  const add = (v) => { try { list.add(new URL(v).origin); } catch { /* not a URL */ } };
  add(env.frontendUrl);
  String(env.corsOrigin || '').split(',').forEach((v) => add(v.trim()));
  if (!env.isProd) ['http://localhost:4173', 'http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:4173', 'http://127.0.0.1:5173'].forEach(add);
  return list;
}

/**
 * CSRF defence for cookie-authenticated writes. The session cookie is
 * SameSite=Lax, which already keeps it off cross-site POSTs; this is the
 * second lock. Browsers always send Origin on cross-origin and on unsafe
 * same-origin requests, so a write that names a foreign origin is refused.
 * Requests with no Origin (curl, server-to-server) carry no ambient cookie
 * from a victim's browser and are allowed through to normal auth.
 */
const sameOrigin = (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.headers.origin;
  if (origin && !allowedOrigins().has(origin)) {
    return next(coded(403, 'bad_origin', 'This request came from a site that is not allowed.'));
  }
  next();
};

module.exports = { requireSession, requireOrg, requirePermission, requirePlatformAdmin, sameOrigin, coded };
