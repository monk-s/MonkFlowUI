/**
 * Server-side sessions (migration 049).
 *
 * The browser holds an opaque random value in an HttpOnly cookie. Only its
 * SHA-256 hash is stored. A session ends when it is revoked, when it passes
 * its absolute limit, or when it has been idle longer than the workspace
 * allows (organizations.session_idle_minutes).
 */
const env = require('../config/env');
const { query } = require('../config/database');
const { generateToken, hashToken } = require('../utils/crypto');
const { permissionsFor } = require('../portal/permissions');

const COOKIE = env.sessionCookieName;
// Not a secret: tells the page shell "there is probably a session" so it can
// avoid flashing the public site. The HttpOnly cookie is what authenticates.
const MARKER_COOKIE = 'mf_si';
const TOUCH_EVERY_MS = 60 * 1000;

function parseCookies(header) {
  const out = {};
  String(header || '').split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i < 1) return;
    const k = part.slice(0, i).trim();
    try { out[k] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* skip malformed */ }
  });
  return out;
}

function cookieOptions(maxAgeMs, httpOnly) {
  return { httpOnly, secure: env.isProd, sameSite: 'lax', path: '/', maxAge: maxAgeMs };
}

function setSessionCookies(res, rawToken) {
  const maxAge = env.sessionAbsoluteHours * 60 * 60 * 1000;
  res.cookie(COOKIE, rawToken, cookieOptions(maxAge, true));
  res.cookie(MARKER_COOKIE, '1', cookieOptions(maxAge, false));
}

function clearSessionCookies(res) {
  res.clearCookie(COOKIE, cookieOptions(undefined, true));
  res.clearCookie(MARKER_COOKIE, cookieOptions(undefined, false));
}

async function createSession({ userId, orgId, authMethod, mfaVerified, req }) {
  const raw = generateToken(48);
  const expires = new Date(Date.now() + env.sessionAbsoluteHours * 60 * 60 * 1000);
  const { rows } = await query(
    `INSERT INTO sessions (token_hash, user_id, org_id, auth_method, mfa_verified, ip, user_agent, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [hashToken(raw), userId, orgId || null, authMethod || 'password', !!mfaVerified,
      (req && req.ip) || null, (req && String(req.headers['user-agent'] || '').slice(0, 400)) || null, expires]
  );
  return { id: rows[0].id, rawToken: raw };
}

/**
 * Resolve the request's cookie to a live session, or null.
 * `touch` records activity (resets the idle clock); pass false for requests
 * that must not keep a session alive, such as the idle-timer's own check.
 */
async function loadSession(req, opts) {
  return loadSessionByToken(parseCookies(req.headers.cookie)[COOKIE], opts);
}

async function loadSessionByToken(raw, { touch = true } = {}) {
  if (!raw || raw.length < 32) return null;

  const { rows } = await query(
    `SELECT s.id, s.user_id, s.org_id, s.auth_method, s.mfa_verified, s.created_at, s.last_seen_at, s.expires_at,
            u.email, u.first_name, u.last_name, u.role AS legacy_role, u.is_platform_admin,
            o.name AS org_name, o.slug AS org_slug, o.vertical AS org_vertical, o.session_idle_minutes,
            m.role AS member_role, m.status AS member_status
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN organizations o ON o.id = s.org_id
       LEFT JOIN memberships m ON m.org_id = s.org_id AND m.user_id = s.user_id
      WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > NOW()`,
    [hashToken(raw)]
  );
  const row = rows[0];
  if (!row) return null;

  const idleMinutes = row.session_idle_minutes || env.sessionIdleMinutesDefault;
  const lastSeen = new Date(row.last_seen_at).getTime();
  if (Date.now() - lastSeen > idleMinutes * 60 * 1000) {
    await query('UPDATE sessions SET revoked_at = NOW() WHERE id = $1 AND revoked_at IS NULL', [row.id]);
    return null;
  }

  let seenAt = lastSeen;
  if (touch && Date.now() - lastSeen > TOUCH_EVERY_MS) {
    await query('UPDATE sessions SET last_seen_at = NOW() WHERE id = $1', [row.id]);
    seenAt = Date.now();
  }

  // Which role does this person hold in the session's workspace right now?
  // Looked up on every request, so removing someone takes effect at once.
  let orgId = row.org_id;
  let role = null;
  if (orgId) {
    if (row.member_role && row.member_status === 'active') role = row.member_role;
    else if (row.is_platform_admin) role = 'monkflow_staff';
    else orgId = null; // membership was removed or suspended
  }

  return {
    id: row.id,
    userId: row.user_id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    isPlatformAdmin: !!row.is_platform_admin,
    legacyRole: row.is_platform_admin ? 'superadmin' : row.legacy_role,
    orgId,
    org: orgId ? { id: orgId, name: row.org_name, slug: row.org_slug, vertical: row.org_vertical } : null,
    role,
    authMethod: row.auth_method,
    mfaVerified: !!row.mfa_verified,
    idleMinutes,
    idleExpiresAt: new Date(seenAt + idleMinutes * 60 * 1000),
    expiresAt: new Date(row.expires_at),
  };
}

async function touchSession(sessionId) {
  await query('UPDATE sessions SET last_seen_at = NOW() WHERE id = $1 AND revoked_at IS NULL', [sessionId]);
}

async function setSessionOrg(sessionId, orgId) {
  await query('UPDATE sessions SET org_id = $2, last_seen_at = NOW() WHERE id = $1', [sessionId, orgId]);
}

async function revokeSession(sessionId) {
  await query('UPDATE sessions SET revoked_at = NOW() WHERE id = $1 AND revoked_at IS NULL', [sessionId]);
}

async function revokeAllForUser(userId, { orgId, exceptSessionId } = {}) {
  await query(
    `UPDATE sessions SET revoked_at = NOW()
      WHERE user_id = $1 AND revoked_at IS NULL
        AND ($2::uuid IS NULL OR org_id = $2)
        AND ($3::uuid IS NULL OR id <> $3)`,
    [userId, orgId || null, exceptSessionId || null]
  );
}

async function listWorkspaces(userId) {
  const { rows } = await query(
    `SELECT o.id, o.name, o.slug, o.vertical, o.parent_org_id, m.role
       FROM memberships m JOIN organizations o ON o.id = m.org_id
      WHERE m.user_id = $1 AND m.status = 'active'
      ORDER BY o.name`,
    [userId]
  );
  return rows.map((r) => ({ id: r.id, name: r.name, slug: r.slug, vertical: r.vertical, parentOrgId: r.parent_org_id, role: r.role }));
}

// What the portal is told about the current session. No secrets.
async function sessionView(session) {
  return {
    user: {
      id: session.userId,
      email: session.email,
      firstName: session.firstName,
      lastName: session.lastName,
      isPlatformAdmin: session.isPlatformAdmin,
    },
    org: session.org,
    role: session.role,
    permissions: session.role ? permissionsFor(session.role) : [],
    workspaces: await listWorkspaces(session.userId),
    authMethod: session.authMethod,
    mfaVerified: session.mfaVerified,
    idleMinutes: session.idleMinutes,
    idleExpiresAt: session.idleExpiresAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
  };
}

module.exports = {
  COOKIE,
  MARKER_COOKIE,
  parseCookies,
  setSessionCookies,
  clearSessionCookies,
  createSession,
  loadSession,
  loadSessionByToken,
  touchSession,
  setSessionOrg,
  revokeSession,
  revokeAllForUser,
  listWorkspaces,
  sessionView,
};
