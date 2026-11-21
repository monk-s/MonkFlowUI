/**
 * Portal v2 sign-in, sessions and invitation acceptance.
 *
 * Shape of every flow:
 *   1. the identity adapter says who the person is   (services/identity)
 *   2. establishSession() checks they may come in     (SSO policy, membership)
 *   3. MonkFlow issues its own cookie session         (services/session.service)
 *
 * Errors carry a machine-readable code in error.details.code; the sign-in
 * screen has specific copy for each one.
 */
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const env = require('../config/env');
const { query, getClient } = require('../config/database');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const { generateToken, hashToken } = require('../utils/crypto');
const userModel = require('../models/user.model');
const { identity, publicConfig } = require('../services/identity');
const sessions = require('../services/session.service');
const { audit } = require('../portal/audit');
const { ROLE_LABELS } = require('../portal/permissions');
const { coded } = require('../middleware/session');
const logger = require('../utils/logger');

const PENDING_COOKIE = 'mf_pending';   // second-factor step in progress
const OAUTH_COOKIE = 'mf_oauth';       // SSO round trip in progress
const MIN_PASSWORD = 12;

const normEmail = (v) => String(v || '').trim().toLowerCase();
const domainOf = (email) => normEmail(email).split('@')[1] || '';
const frontend = () => env.frontendUrl.replace(/\/+$/, '');

// Only ever redirect to a path on this site.
const safeNext = (v) => (typeof v === 'string' && /^\/(?!\/)[\w\-./?=&%]*$/.test(v) ? v : '');

const shortCookie = (minutes) => ({ httpOnly: true, secure: env.isProd, sameSite: 'lax', path: '/api/v1/auth', maxAge: minutes * 60 * 1000 });
const signShort = (payload, minutes) => jwt.sign(payload, env.jwtSecret, { expiresIn: `${minutes}m` });
const readShort = (req, name) => {
  const raw = sessions.parseCookies(req.headers.cookie)[name];
  if (!raw) return null;
  try { return jwt.verify(raw, env.jwtSecret); } catch { return null; }
};

const parse = (schema, data) => {
  const result = schema.safeParse(data);
  if (!result.success) {
    const err = new Error('Validation error');
    err.name = 'ZodError';
    err.errors = result.error.errors;
    throw err;
  }
  return result.data;
};

const emailSchema = z.object({ email: z.string().trim().email('Enter a valid email address') });
const signInSchema = emailSchema.extend({ password: z.string().min(1, 'Enter your password').max(500) });
const codeSchema = z.object({ code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code') });

// Does this address belong to a firm that requires its own identity provider?
// Answered from the DOMAIN only, so it never reveals whether an account exists.
async function ssoPolicyFor(email) {
  const domain = domainOf(email);
  if (!domain) return null;
  const { rows } = await query(
    `SELECT sso_provider FROM organizations
      WHERE sso_required = TRUE AND $1 = ANY(allowed_email_domains)
      ORDER BY created_at LIMIT 1`,
    [domain]
  );
  return rows[0] ? { provider: rows[0].sso_provider } : null;
}

const ssoRequiredError = (provider) => coded(403, 'sso_required',
  `Your firm requires sign-in with ${provider === 'google' ? 'Google' : 'Microsoft'}.`, { provider });

/**
 * The single gate every sign-in path goes through once identity is proven.
 * Returns { next, session } and sets the cookies, or throws a coded error.
 */
async function establishSession(req, res, { user, method, mfaVerified, preferOrgId }) {
  const policy = await ssoPolicyFor(user.email);
  if (policy && method !== `sso:${policy.provider}`) throw ssoRequiredError(policy.provider);

  const workspaces = await sessions.listWorkspaces(user.id);
  if (workspaces.length === 0 && !user.is_platform_admin) {
    throw coded(403, 'no_workspace', 'Your login is not attached to a workspace. Ask the person who invited you, or contact MonkFlow.');
  }

  let orgId = null;
  if (preferOrgId && workspaces.some((w) => w.id === preferOrgId)) orgId = preferOrgId;
  else if (workspaces.length === 1) orgId = workspaces[0].id;

  // Remembered for the workspace picker.
  let lastOrgId = null;
  if (!orgId && workspaces.length > 1) {
    const { rows } = await query(
      'SELECT org_id FROM sessions WHERE user_id = $1 AND org_id IS NOT NULL ORDER BY created_at DESC LIMIT 1',
      [user.id]
    );
    if (rows[0] && workspaces.some((w) => w.id === rows[0].org_id)) lastOrgId = rows[0].org_id;
  }

  const created = await sessions.createSession({ userId: user.id, orgId, authMethod: method, mfaVerified, req });
  sessions.setSessionCookies(res, created.rawToken);

  await audit(null, req, {
    orgId,
    actorUserId: user.id,
    actorEmail: user.email,
    actorRole: orgId ? (workspaces.find((w) => w.id === orgId) || {}).role : (user.is_platform_admin ? 'monkflow_staff' : null),
    action: 'auth.signed_in',
    targetType: 'session',
    targetId: created.id,
    metadata: { method, mfa: !!mfaVerified },
  });

  // The request has no cookie yet, so read the session back by its token.
  const session = await sessions.loadSessionByToken(created.rawToken, { touch: false });
  const view = await sessions.sessionView(session);
  view.mfaSetupRequired = mfaSetupRequired(session);
  view.lastOrgId = lastOrgId;

  let next = 'dashboard';
  if (view.mfaSetupRequired) next = 'mfa-setup';
  else if (!orgId) next = workspaces.length > 1 ? 'select-workspace' : 'admin';
  return { next, session: view };
}

// Password sign-ins must add a second factor when the provider supports one.
// SSO sign-ins rely on the firm's identity provider for MFA.
function mfaSetupRequired(session) {
  return !!identity().capabilities.mfa && session.authMethod === 'password' && !session.mfaVerified;
}

async function recordFailure(req, email, reason) {
  try {
    await audit(null, req, { orgId: null, actorUserId: null, actorEmail: normEmail(email), actorRole: null, action: 'auth.sign_in_failed', metadata: { reason } });
  } catch (err) { logger.error('audit write failed: %s', err.message); }
}

// ── Public configuration ──────────────────────────────────────
const getConfig = catchAsync(async (req, res) => {
  res.json({ methods: publicConfig(), minPasswordLength: MIN_PASSWORD });
});

const discover = catchAsync(async (req, res) => {
  const { email } = parse(emailSchema, req.body);
  const policy = await ssoPolicyFor(email);
  res.json({ ssoRequired: policy ? policy.provider : null, methods: publicConfig() });
});

// ── Password ──────────────────────────────────────────────────
const signIn = catchAsync(async (req, res) => {
  const { email, password } = parse(signInSchema, req.body);
  const policy = await ssoPolicyFor(email);
  if (policy) throw ssoRequiredError(policy.provider);

  const result = await identity().verifyPassword({ email: normEmail(email), password });
  if (!result.ok) {
    await recordFailure(req, email, 'bad_credentials');
    throw coded(401, 'invalid_credentials', 'That email and password do not match.');
  }

  if (result.mfa) {
    res.cookie(PENDING_COOKIE, signShort({ email: normEmail(email), ...result.mfa }, 5), shortCookie(5));
    return res.json({ next: 'mfa' });
  }

  const user = await userModel.findByEmailCI(result.identity.email);
  if (!user) throw coded(401, 'invalid_credentials', 'That email and password do not match.');
  res.json(await establishSession(req, res, { user, method: 'password', mfaVerified: false, preferOrgId: req.body.orgId }));
});

const verifyMfa = catchAsync(async (req, res) => {
  const { code } = parse(codeSchema, req.body);
  const pending = readShort(req, PENDING_COOKIE);
  if (!pending) throw coded(401, 'mfa_expired', 'That took too long. Sign in again.');

  const result = await identity().verifyMfa({ pendingToken: pending.pendingToken, challengeId: pending.challengeId, code });
  if (!result.ok) {
    await recordFailure(req, pending.email, 'bad_mfa_code');
    throw coded(401, 'invalid_code', 'That code is not right. Check your authenticator app and try again.');
  }
  res.clearCookie(PENDING_COOKIE, shortCookie(0));
  const user = await userModel.findByEmailCI(result.identity.email);
  if (!user) throw coded(401, 'invalid_credentials', 'That email and password do not match.');
  res.json(await establishSession(req, res, { user, method: 'password', mfaVerified: true }));
});

// ── Emailed sign-in code ──────────────────────────────────────
const sendEmailCode = catchAsync(async (req, res) => {
  if (!publicConfig().emailCode) throw ApiError.notFound('Not found');
  const { email } = parse(emailSchema, req.body);
  const policy = await ssoPolicyFor(email);
  if (policy) throw ssoRequiredError(policy.provider);
  const user = await userModel.findByEmailCI(email);
  if (user) {
    try { await identity().sendEmailCode({ email: user.email }); } catch (err) { logger.error('email code send failed: %s', err.message); }
  }
  // Same answer whether or not the account exists.
  res.json({ sent: true });
});

const verifyEmailCode = catchAsync(async (req, res) => {
  if (!publicConfig().emailCode) throw ApiError.notFound('Not found');
  const { email } = parse(emailSchema, req.body);
  const { code } = parse(codeSchema, req.body);
  const result = await identity().verifyEmailCode({ email: normEmail(email), code });
  const user = result.ok ? await userModel.findByEmailCI(result.identity.email) : null;
  if (!user) {
    await recordFailure(req, email, 'bad_email_code');
    throw coded(401, 'invalid_code', 'That code is not right or has expired. Request a new one.');
  }
  res.json(await establishSession(req, res, { user, method: 'email_code', mfaVerified: false }));
});

// ── Single sign-on ────────────────────────────────────────────
const ssoStart = catchAsync(async (req, res) => {
  const provider = req.params.provider;
  if (!publicConfig().sso.includes(provider)) throw ApiError.notFound('Not found');
  const state = generateToken(16);
  const invite = /^[0-9a-f]{32,128}$/.test(String(req.query.invite || '')) ? req.query.invite : '';
  res.cookie(OAUTH_COOKIE, signShort({ state, provider, next: safeNext(req.query.next), invite }, 10), shortCookie(10));
  res.redirect(identity().ssoAuthorizeUrl({
    provider,
    state,
    redirectUri: `${frontend()}/api/v1/auth/sso/callback`,
    loginHint: req.query.email ? normEmail(req.query.email) : '',
  }));
});

const ssoCallback = catchAsync(async (req, res) => {
  const flow = readShort(req, OAUTH_COOKIE);
  res.clearCookie(OAUTH_COOKIE, shortCookie(0));
  const fail = (code, extra) => {
    const q = new URLSearchParams({ error: code, ...(extra || {}) });
    const base = flow && flow.invite ? `/invite/${flow.invite}` : '/sign-in';
    res.redirect(`${frontend()}${base}?${q}`);
  };

  if (!flow || !req.query.state || flow.state !== req.query.state || !req.query.code) return fail('sso_failed');
  const result = await identity().exchangeSsoCode({ code: String(req.query.code) });
  if (!result.ok || result.provider !== flow.provider) return fail('sso_failed');

  const method = `sso:${result.provider}`;
  try {
    let outcome;
    if (flow.invite) {
      outcome = await acceptInvitation(req, res, { rawToken: flow.invite, ssoIdentity: result.identity, method });
    } else {
      const user = await userModel.findByEmailCI(result.identity.email);
      if (!user) return fail('no_account');
      if (result.identity.externalId && !user.external_id) await userModel.update(user.id, { external_id: result.identity.externalId });
      outcome = await establishSession(req, res, { user, method, mfaVerified: false });
    }
    const q = new URLSearchParams({ to: outcome.next });
    if (flow.next) q.set('next', flow.next);
    res.redirect(`${frontend()}/auth/callback?${q}`);
  } catch (err) {
    if (err.code) return fail(err.code, err.details && err.details.provider ? { provider: err.details.provider } : null);
    throw err;
  }
});

// Development stand-in for an identity provider's sign-in page. Exists only
// when the stub adapter is loaded, which production refuses.
const stubIdp = catchAsync(async (req, res) => {
  if (identity().name !== 'stub') throw ApiError.notFound('Not found');
  const esc = (v) => String(v || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const { provider, state, redirect_uri: redirectUri, login_hint: hint } = req.query;
  if (!String(redirectUri || '').startsWith(`${frontend()}/api/v1/auth/sso/callback`)) throw ApiError.badRequest('Bad redirect');
  res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; form-action 'self'");
  res.type('html').send(`<!doctype html><meta charset="utf-8"><title>Stub identity provider</title>
<body style="font:15px system-ui;max-width:420px;margin:80px auto;padding:0 16px">
<p style="background:#fff4d6;border:1px solid #e0c36a;padding:10px 12px;border-radius:6px"><strong>Development only.</strong> This page stands in for ${esc(provider)} sign-in.</p>
<form onsubmit="event.preventDefault();location.href='${esc(redirectUri)}?state=${esc(state)}&code='+encodeURIComponent('${esc(provider)}:'+this.email.value)">
<label>Come back as<br><input name="email" type="email" required value="${esc(hint)}" style="width:100%;padding:8px;margin:6px 0 12px;font:inherit"></label>
<button style="padding:8px 14px;font:inherit">Continue</button></form>`);
});

// ── MFA enrolment (password accounts, when the provider supports it) ──
const enrollMfa = catchAsync(async (req, res) => {
  if (!publicConfig().mfa) throw ApiError.notFound('Not found');
  const out = await identity().enrollTotp({ email: req.session.email });
  res.json({ factorId: out.factorId, secret: out.secret, otpauthUrl: out.otpauthUrl });
});

const confirmMfa = catchAsync(async (req, res) => {
  if (!publicConfig().mfa) throw ApiError.notFound('Not found');
  const { code } = parse(codeSchema, req.body);
  const factorId = String(req.body.factorId || '');
  const result = await identity().confirmTotp({ factorId, code, email: req.session.email });
  if (!result.ok) throw coded(401, 'invalid_code', 'That code is not right. Check your authenticator app and try again.');
  await query('UPDATE sessions SET mfa_verified = TRUE WHERE id = $1', [req.session.id]);
  await query('UPDATE users SET mfa_enrolled_at = COALESCE(mfa_enrolled_at, NOW()) WHERE id = $1', [req.session.userId]);
  await audit(null, req, { action: 'auth.mfa_enrolled', targetType: 'user', targetId: req.session.userId });
  const session = await sessions.loadSession(req, { touch: false });
  const view = await sessions.sessionView(session);
  view.mfaSetupRequired = false;
  res.json({ next: session.orgId ? 'dashboard' : (view.workspaces.length > 1 ? 'select-workspace' : 'admin'), session: view });
});

// ── Session ───────────────────────────────────────────────────
const getSession = catchAsync(async (req, res) => {
  // A read that must not keep an idle session alive.
  const session = await sessions.loadSession(req, { touch: false });
  if (!session) {
    sessions.clearSessionCookies(res);
    throw coded(401, 'not_signed_in', 'Not signed in.');
  }
  const view = await sessions.sessionView(session);
  view.mfaSetupRequired = mfaSetupRequired(session);
  res.json({ session: view });
});

const touch = catchAsync(async (req, res) => {
  await sessions.touchSession(req.session.id);
  const idleExpiresAt = new Date(Date.now() + req.session.idleMinutes * 60 * 1000);
  res.json({ idleExpiresAt: idleExpiresAt.toISOString(), expiresAt: req.session.expiresAt.toISOString() });
});

const selectWorkspace = catchAsync(async (req, res) => {
  const { orgId } = parse(z.object({ orgId: z.string().uuid() }), req.body);
  const workspaces = await sessions.listWorkspaces(req.session.userId);
  let allowed = workspaces.some((w) => w.id === orgId);
  if (!allowed && req.session.isPlatformAdmin) {
    const { rows } = await query('SELECT 1 FROM organizations WHERE id = $1', [orgId]);
    allowed = rows.length > 0;
  }
  if (!allowed) throw ApiError.notFound('Not found');

  await sessions.setSessionOrg(req.session.id, orgId);
  const session = await sessions.loadSession(req, { touch: false });
  req.session = session;
  await audit(null, req, { action: 'auth.workspace_entered', targetType: 'organization', targetId: orgId });
  const view = await sessions.sessionView(session);
  view.mfaSetupRequired = mfaSetupRequired(session);
  res.json({ session: view });
});

const signOut = catchAsync(async (req, res) => {
  const session = await sessions.loadSession(req, { touch: false });
  if (session) {
    await sessions.revokeSession(session.id);
    req.session = session;
    await audit(null, req, { action: 'auth.signed_out', targetType: 'session', targetId: session.id });
  }
  sessions.clearSessionCookies(res);
  res.json({ ok: true });
});

// ── Invitations ───────────────────────────────────────────────
async function findInvitation(rawToken) {
  if (!/^[0-9a-f]{32,128}$/.test(String(rawToken || ''))) return { state: 'invalid' };
  const { rows } = await query(
    `SELECT i.*, o.name AS org_name, o.vertical AS org_vertical, o.sso_required, o.sso_provider,
            NULLIF(btrim(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), '') AS inviter_name,
            u.email AS inviter_email
       FROM invitations i
       JOIN organizations o ON o.id = i.org_id
       LEFT JOIN users u ON u.id = i.invited_by
      WHERE i.token_hash = $1`,
    [hashToken(rawToken)]
  );
  const row = rows[0];
  if (!row) return { state: 'invalid' };
  let state = 'valid';
  if (row.revoked_at) state = 'revoked';
  else if (row.accepted_at) state = 'accepted';
  else if (new Date(row.expires_at).getTime() < Date.now()) state = 'expired';
  return { state, row };
}

const getInvitation = catchAsync(async (req, res) => {
  const { state, row } = await findInvitation(req.params.token);
  // An unknown token says nothing about what exists.
  if (state === 'invalid' || state === 'revoked') return res.json({ invitation: { state: 'invalid' } });

  if (state === 'valid' && !row.opened_at) {
    await query('UPDATE invitations SET opened_at = NOW() WHERE id = $1', [row.id]);
  }
  const existing = await userModel.findByEmailCI(row.email);
  const methods = publicConfig();
  res.json({
    invitation: {
      state,
      email: row.email,
      role: row.role,
      roleLabel: ROLE_LABELS[row.role],
      org: { name: row.org_name, vertical: row.org_vertical },
      inviterName: row.inviter_name || 'MonkFlow',
      expiresAt: row.expires_at,
      accountExists: !!existing,
      ssoRequired: row.sso_required ? row.sso_provider : null,
      methods,
      minPasswordLength: MIN_PASSWORD,
    },
  });
});

const acceptSchema = z.object({
  firstName: z.string().trim().min(1, 'Enter your first name').max(100),
  lastName: z.string().trim().min(1, 'Enter your last name').max(100),
  password: z.string().min(MIN_PASSWORD, `Choose a password of at least ${MIN_PASSWORD} characters`).max(500),
});

/**
 * Turn a valid invitation into a membership and a session. Three ways in:
 *   - already signed in as the invited address      (existingSession)
 *   - came back from SSO as the invited address     (ssoIdentity)
 *   - new person choosing a password                (form)
 */
async function acceptInvitation(req, res, { rawToken, form, ssoIdentity, existingSession, method }) {
  const { state, row } = await findInvitation(rawToken);
  if (state !== 'valid') {
    throw coded(410, `invitation_${state === 'revoked' ? 'invalid' : state}`, 'This invitation can no longer be used.');
  }
  const invitedEmail = normEmail(row.email);
  const mismatch = () => coded(403, 'email_mismatch', `This invitation was sent to ${row.email}. Sign in with that address to accept it.`);

  let user = await userModel.findByEmailCI(invitedEmail);
  let newUserFields = null;

  if (existingSession) {
    if (normEmail(existingSession.email) !== invitedEmail) throw mismatch();
  } else if (ssoIdentity) {
    if (normEmail(ssoIdentity.email) !== invitedEmail) throw mismatch();
    if (row.sso_required && method !== `sso:${row.sso_provider}`) throw ssoRequiredError(row.sso_provider);
    if (!user) newUserFields = { firstName: ssoIdentity.firstName || '', lastName: ssoIdentity.lastName || '', passwordHash: null, externalId: ssoIdentity.externalId || null };
  } else {
    if (row.sso_required) throw ssoRequiredError(row.sso_provider);
    if (user) throw coded(409, 'account_exists', 'You already have a MonkFlow login. Sign in to accept this invitation.');
    const data = parse(acceptSchema, form || {});
    const created = await identity().createPasswordUser({ email: invitedEmail, password: data.password, firstName: data.firstName, lastName: data.lastName });
    newUserFields = { firstName: data.firstName, lastName: data.lastName, passwordHash: created.passwordHash || null, externalId: created.externalId || null };
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');
    // Lock the invitation so two clicks cannot both accept it.
    const locked = await client.query(
      'SELECT id FROM invitations WHERE id = $1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > NOW() FOR UPDATE',
      [row.id]
    );
    if (locked.rows.length === 0) throw coded(410, 'invitation_accepted', 'This invitation can no longer be used.');

    if (!user) {
      const inserted = await client.query(
        `INSERT INTO users (email, password_hash, first_name, last_name, company, role, email_verified, external_id, home_org_id)
         VALUES ($1, $2, $3, $4, $5, 'viewer', TRUE, $6, $7) RETURNING *`,
        [invitedEmail, newUserFields.passwordHash, newUserFields.firstName, newUserFields.lastName, row.org_name, newUserFields.externalId, row.org_id]
      );
      user = inserted.rows[0];
    } else if (!user.home_org_id) {
      await client.query('UPDATE users SET home_org_id = $2 WHERE id = $1', [user.id, row.org_id]);
    }

    await client.query(
      `INSERT INTO memberships (org_id, user_id, role) VALUES ($1, $2, $3)
       ON CONFLICT (org_id, user_id) DO UPDATE SET role = EXCLUDED.role, status = 'active', updated_at = NOW()`,
      [row.org_id, user.id, row.role]
    );
    await client.query('UPDATE invitations SET accepted_at = NOW(), accepted_user_id = $2 WHERE id = $1', [row.id, user.id]);
    await audit(client, req, {
      orgId: row.org_id, actorUserId: user.id, actorEmail: user.email, actorRole: row.role,
      action: 'invitation.accepted', targetType: 'invitation', targetId: row.id, metadata: { role: row.role, method },
    });
    await client.query('COMMIT');
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* connection gone */ }
    throw err;
  } finally {
    client.release();
  }

  if (existingSession) {
    await sessions.setSessionOrg(existingSession.id, row.org_id);
    const session = await sessions.loadSession(req, { touch: false });
    const view = await sessions.sessionView(session);
    view.mfaSetupRequired = mfaSetupRequired(session);
    return { next: view.mfaSetupRequired ? 'mfa-setup' : 'dashboard', session: view };
  }
  return establishSession(req, res, { user, method, mfaVerified: false, preferOrgId: row.org_id });
}

const acceptInvitationHandler = catchAsync(async (req, res) => {
  const existingSession = await sessions.loadSession(req, { touch: false });
  const outcome = await acceptInvitation(req, res, {
    rawToken: req.params.token,
    form: req.body,
    existingSession,
    method: existingSession ? existingSession.authMethod : 'password',
  });
  res.status(201).json(outcome);
});

const requestNewInvitation = catchAsync(async (req, res) => {
  const { state, row } = await findInvitation(req.params.token);
  const recently = row && row.renewal_requested_at && Date.now() - new Date(row.renewal_requested_at).getTime() < 60 * 60 * 1000;
  if (state === 'expired' && !recently) {
    await query('UPDATE invitations SET renewal_requested_at = NOW() WHERE id = $1', [row.id]);
    try {
      const emailService = require('../services/email.service');
      await emailService.sendInvitationRenewalRequest({ to: row.inviter_email, inviteeEmail: row.email, orgName: row.org_name });
    } catch (err) { logger.error('renewal request email failed: %s', err.message); }
  }
  // Same answer in every case.
  res.json({ ok: true });
});

module.exports = {
  getConfig, discover, signIn, verifyMfa, sendEmailCode, verifyEmailCode,
  ssoStart, ssoCallback, stubIdp, enrollMfa, confirmMfa,
  getSession, touch, selectWorkspace, signOut,
  getInvitation, acceptInvitationHandler, requestNewInvitation,
  establishSession, MIN_PASSWORD,
};
