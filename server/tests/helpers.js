const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const db = require('../src/config/database');
const sessions = require('../src/services/session.service');
const { generateToken, hashToken } = require('../src/utils/crypto');

const PASSWORD = 'correct horse battery';
let n = 0;
const uniq = (prefix) => `${prefix}${Date.now().toString(36)}${(n++).toString(36)}`;

async function createOrg(fields = {}) {
  const name = fields.name || uniq('Firm ');
  const { rows } = await db.query(
    `INSERT INTO organizations (name, slug, vertical, allowed_email_domains, sso_provider, sso_required, session_idle_minutes)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [name, uniq('org-'), fields.vertical || 'CRE', fields.domains || [], fields.ssoProvider || null, !!fields.ssoRequired, fields.idleMinutes || 30]
  );
  return rows[0];
}

async function createUser(fields = {}) {
  const email = fields.email || `${uniq('user')}@example.test`;
  const hash = fields.noPassword ? null : bcrypt.hashSync(fields.password || PASSWORD, 4);
  const { rows } = await db.query(
    `INSERT INTO users (email, password_hash, first_name, last_name, role, is_platform_admin, mfa_enrolled_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [email, hash, fields.firstName || 'Test', fields.lastName || 'Person', fields.platformAdmin ? 'superadmin' : 'viewer', !!fields.platformAdmin, fields.mfaEnrolled ? new Date() : null]
  );
  return rows[0];
}

async function addMember(org, user, role = 'admin') {
  const { rows } = await db.query(
    'INSERT INTO memberships (org_id, user_id, role) VALUES ($1, $2, $3) RETURNING *',
    [org.id, user.id, role]
  );
  return rows[0];
}

// A person with a login and a role in a workspace.
async function member(org, role = 'admin', fields = {}) {
  const user = await createUser(fields);
  const membership = await addMember(org, user, role);
  return { user, membership, cookie: await cookieFor(user, org) };
}

// A signed-in, second-factor-verified session, without going through the
// sign-in screens (those are covered in auth.test.js).
async function cookieFor(user, org, opts = {}) {
  const created = await sessions.createSession({
    userId: user.id, orgId: org ? org.id : null, authMethod: opts.method || 'password',
    mfaVerified: opts.mfaVerified !== false, req: { ip: '127.0.0.1', headers: {} },
  });
  return `${sessions.COOKIE}=${created.rawToken}`;
}

async function createInvitation(org, email, role = 'reviewer', fields = {}) {
  const token = generateToken(32);
  const expires = fields.expiresAt || new Date(Date.now() + 7 * 864e5);
  const { rows } = await db.query(
    `INSERT INTO invitations (org_id, email, role, token_hash, invited_by, expires_at, revoked_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [org.id, email, role, hashToken(token), fields.invitedBy || null, expires, fields.revoked ? new Date() : null]
  );
  return { token, row: rows[0] };
}

// A workflow in a workspace, owned (as legacy rows must be) by some user.
async function createWorkflow(org, owner, fields = {}) {
  const { rows } = await db.query(
    `INSERT INTO workflows (user_id, org_id, name, description, status, trigger_type)
     VALUES ($1, $2, $3, $4, $5, 'manual') RETURNING *`,
    [owner.id, org ? org.id : null, fields.name || uniq('Workflow '), fields.description || null, fields.status || 'active']
  );
  return rows[0];
}

// A run that started `daysAgo` days ago.
async function createRun(workflow, fields = {}) {
  const status = fields.status || 'completed';
  const { rows } = await db.query(
    `INSERT INTO workflow_executions (workflow_id, status, trigger_type, trigger_payload, result, error_message, started_at, completed_at, duration_ms)
     VALUES ($1, $2, 'manual', $3, $4, $5, NOW() - ($6 || ' days')::interval, NOW() - ($6 || ' days')::interval + INTERVAL '1 minute', $7)
     RETURNING *`,
    [workflow.id, status, JSON.stringify({ secret: 'payload' }), JSON.stringify({ secret: 'result' }),
      status === 'failed' ? (fields.error || 'Source file was empty') : null, String(fields.daysAgo || 0), fields.durationMs ?? 60000]
  );
  return rows[0];
}

const code = (res) => res.body && res.body.error && res.body.error.details && res.body.error.details.code;
// One listening server per test file. Handing supertest the bare app makes it
// open and close a new listener for every request, and under parallel test
// files that intermittently ended a request with "socket hang up".
const server = app.listen(0, '127.0.0.1');
const api = () => request(server);
const agent = () => request.agent(server);
const close = async () => { await new Promise((resolve) => server.close(resolve)); await db.pool.end(); };

module.exports = { app, db, api, agent, close, code, uniq, PASSWORD, createOrg, createUser, addMember, member, cookieFor, createInvitation, createWorkflow, createRun };
