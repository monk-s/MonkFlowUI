#!/usr/bin/env node
/**
 * Local API for working on the portal. LOCAL DEVELOPMENT ONLY.
 *
 *   node scripts/dev-portal.js            (from server/)
 *   npm --prefix ../portal run dev        (in another terminal) -> http://localhost:5173
 *
 * What it does, all on this machine and nothing else:
 *   - starts a private Postgres (testdb/start.mjs), wiped on every run
 *   - applies the migrations the way production does
 *   - loads the sample workspaces below
 *   - serves the API on :8080 with the STUB identity provider, so SSO,
 *     emailed codes and MFA can all be clicked through without a vendor
 *   - does NOT start the schedulers (no outreach, billing or cron jobs)
 *
 * Everything seeded here is EXAMPLE_DATA: invented firms on the reserved
 * .test domain. None of it is a client and none of it may be copied into
 * anything a prospect or client sees as if it were real.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const DB_PORT = Number(process.env.DEV_DB_PORT) || 54331;
const API_PORT = Number(process.env.PORT) || 8080;
const FRONTEND = process.env.FRONTEND_URL || 'http://localhost:5173';

if (process.env.NODE_ENV === 'production') {
  console.error('dev-portal.js refuses to run with NODE_ENV=production.');
  process.exit(1);
}

Object.assign(process.env, {
  NODE_ENV: 'development',
  PORT: String(API_PORT),
  DATABASE_URL: `postgresql://postgres:postgres@127.0.0.1:${DB_PORT}/monkflow`,
  JWT_SECRET: 'local-development-only',
  IDENTITY_PROVIDER: process.env.IDENTITY_PROVIDER || 'stub',
  FRONTEND_URL: FRONTEND,
  CORS_ORIGIN: FRONTEND,
  RESEND_API_KEY: '',          // emails are printed to this terminal, never sent
  LEADGEN_ENABLED: 'false',
  LINKEDIN_OUTREACH_ENABLED: 'false',
});

const EXAMPLE_PASSWORD = 'correct horse battery';
// Fixed tokens so the invitation screens can be opened directly.
const EXAMPLE_TOKENS = {
  valid: 'a1'.repeat(32),
  expired: 'b2'.repeat(32),
  existingLogin: 'c3'.repeat(32),
  ssoFirm: 'd4'.repeat(32),
};

async function startDb() {
  const child = spawn(process.execPath, [path.join(root, 'testdb', 'start.mjs'), String(DB_PORT), path.join(root, 'testdb', '.dev-data')], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Database did not start within 60s')), 60000);
    child.stdout.on('data', (buf) => { if (/READY/.test(String(buf))) { clearTimeout(timer); resolve(); } });
    child.on('exit', (code) => reject(new Error(`Database exited (code ${code}). Is port ${DB_PORT} in use?`)));
  });
  return child;
}

async function migrate(pool) {
  const dir = path.join(root, 'migrations');
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(fs.readFileSync(path.join(dir, file), 'utf8'));
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      if (parseInt(file, 10) >= 48) throw new Error(`${file}: ${err.message}`);
    } finally { client.release(); }
  }
}

async function seedExampleData(pool) {
  const bcrypt = require('bcryptjs');
  const { hashToken } = require('../src/utils/crypto');
  const hash = bcrypt.hashSync(EXAMPLE_PASSWORD, 8);
  const q = (text, params) => pool.query(text, params).then((r) => r.rows[0]);

  const org = (name, vertical, extra = {}) => q(
    `INSERT INTO organizations (name, slug, vertical, allowed_email_domains, sso_provider, sso_required, session_idle_minutes, parent_org_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [name, name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), vertical, extra.domains || [], extra.sso || null, !!extra.sso, extra.idle || 30, extra.parent || null]
  );
  const user = (email, first, last, extra = {}) => q(
    `INSERT INTO users (email, password_hash, first_name, last_name, role, is_platform_admin, mfa_enrolled_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [email, extra.noPassword ? null : hash, first, last, extra.staff ? 'superadmin' : 'viewer', !!extra.staff, extra.mfa ? new Date() : null]
  );
  const member = (o, u, role) => pool.query('INSERT INTO memberships (org_id, user_id, role) VALUES ($1, $2, $3)', [o.id, u.id, role]);
  const invite = (o, email, role, token, by, days) => pool.query(
    `INSERT INTO invitations (org_id, email, role, token_hash, invited_by, expires_at) VALUES ($1, $2, $3, $4, $5, NOW() + ($6 || ' days')::interval)`,
    [o.id, email, role, hashToken(token), by.id, String(days)]
  );

  const harbor = await org('Harbor Ridge Capital', 'CRE', { idle: 30 });
  const fund2 = await org('Harbor Ridge Fund II', 'INVESTMENT_FIRM', { parent: harbor.id });
  const cedar = await org('Cedar Point Bank', 'BANK', { domains: ['cedarpoint.test'], sso: 'microsoft', idle: 15 });

  await user('staff@monkflow.test', 'Nathan', 'Linder', { staff: true, mfa: true });
  const dana = await user('dana@harborridge.test', 'Dana', 'Okafor', { mfa: true });
  const marcus = await user('marcus@harborridge.test', 'Marcus', 'Bell', { mfa: true });
  const ines = await user('ines@harborridge.test', 'Ines', 'Varga', { mfa: true });
  const fresh = await user('fresh@harborridge.test', 'Riley', 'Chen');   // has not set up a second factor yet
  const coo = await user('coo@cedarpoint.test', 'Priya', 'Shah', { noPassword: true });
  const lonely = await user('nobody@example.test', 'No', 'Workspace', { mfa: true });

  await member(harbor, dana, 'admin');
  await member(harbor, marcus, 'reviewer');
  await member(harbor, ines, 'auditor');
  await member(harbor, fresh, 'reviewer');
  await member(fund2, dana, 'auditor');
  await member(cedar, coo, 'admin');
  void lonely;

  await invite(harbor, 'newhire@harborridge.test', 'reviewer', EXAMPLE_TOKENS.valid, dana, 7);
  await invite(harbor, 'late@harborridge.test', 'auditor', EXAMPLE_TOKENS.expired, dana, -2);
  await invite(fund2, 'marcus@harborridge.test', 'reviewer', EXAMPLE_TOKENS.existingLogin, dana, 7);
  await invite(cedar, 'analyst@cedarpoint.test', 'reviewer', EXAMPLE_TOKENS.ssoFirm, coo, 7);
}

(async () => {
  if (!fs.existsSync(path.join(root, 'testdb', 'node_modules'))) {
    console.error('Run `npm --prefix testdb install` once first (installs the local Postgres).');
    process.exit(1);
  }
  const db = await startDb();
  const { pool } = require('../src/config/database');
  await migrate(pool);
  await seedExampleData(pool);

  const app = require('../src/app');
  const server = app.listen(API_PORT, '127.0.0.1', () => {
    const stub = require('../src/services/identity/stub');
    console.log(`
MonkFlow API (local, EXAMPLE_DATA) on http://127.0.0.1:${API_PORT}   identity: ${process.env.IDENTITY_PROVIDER}
Portal:  ${FRONTEND}/sign-in

Password for every sample login:  ${EXAMPLE_PASSWORD}
MFA code: ${stub.MFA_CODE}    emailed sign-in code: ${stub.EMAIL_CODE}

  dana@harborridge.test      admin of Harbor Ridge Capital, auditor of Fund II (two workspaces)
  marcus@harborridge.test    reviewer
  ines@harborridge.test      read-only auditor
  fresh@harborridge.test     reviewer who has not set up a second factor
  coo@cedarpoint.test        Cedar Point Bank: Microsoft sign-in required, no password
  nobody@example.test        a login with no workspace
  staff@monkflow.test        MonkFlow staff

Invitations:
  valid            ${FRONTEND}/invite/${EXAMPLE_TOKENS.valid}
  expired          ${FRONTEND}/invite/${EXAMPLE_TOKENS.expired}
  existing login   ${FRONTEND}/invite/${EXAMPLE_TOKENS.existingLogin}
  SSO-only firm    ${FRONTEND}/invite/${EXAMPLE_TOKENS.ssoFirm}
`);
  });

  const stop = () => { server.close(); pool.end().catch(() => {}); db.kill('SIGTERM'); setTimeout(() => process.exit(0), 1500); };
  // A port clash must not leave the database running in the background.
  server.on('error', (err) => { console.error(`API could not start: ${err.message}. Set PORT to a free port.`); stop(); });
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
})().catch((err) => { console.error(err.message); process.exit(1); });

module.exports = { EXAMPLE_PASSWORD, EXAMPLE_TOKENS };
