#!/usr/bin/env node
/**
 * Local API for working on the portal. LOCAL DEVELOPMENT ONLY.
 *
 *   node scripts/dev-portal.js            (from server/)
 *   npm --prefix ../portal run dev        (in another terminal) -> http://localhost:5173
 *
 * To use it behind the full-site preview instead (scripts/dev-server.mjs),
 * set FRONTEND_URL to the preview's address, e.g. http://localhost:4173, or
 * the API refuses writes from it as cross-site.
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

  const staff = await user('staff@monkflow.test', 'Nathan', 'Linder', { staff: true, mfa: true });
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

  await seedExampleEngagement(pool, q, { harbor, staff, dana });
}

// EXAMPLE_DATA for the Overview and Workflows screens: one engagement in its
// third stage with a milestone waiting for sign-off, one open request, two
// workflows with six weeks of runs, and one draft that must never show.
// Cedar Point Bank and Fund II get nothing, so the empty states can be seen.
// portal/tests/overview.spec.ts counts on these exact rows.
async function seedExampleEngagement(pool, q, { harbor, staff, dana }) {
  const { audit } = require('../src/portal/audit');
  const asStaff = (action, targetType, targetId, metadata) => audit(null, null, {
    orgId: harbor.id, actorUserId: staff.id, actorEmail: staff.email, actorRole: 'monkflow_staff', action, targetType, targetId, metadata,
  });
  // Due dates are calendar dates as the person reading them sees today.
  const inDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  // Run days are counted in UTC (routes/portal/workflow.routes.js).
  const utcDaysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

  const eng = await q(
    `INSERT INTO engagements (org_id, name, summary, stage, next_deliverable, next_deliverable_due)
     VALUES ($1, 'Rent roll and T-12 intake', 'Rent rolls and T-12 statements read, checked and prepared for your accounting system.', 'integration', 'UAT results on 20 sample rent rolls', $2) RETURNING *`,
    [harbor.id, inDays(3)]
  );
  await asStaff('engagement.created', 'engagement', eng.id, { name: eng.name, stage: 'discovery' });

  const milestone = (stage, title, status, extra = {}) => q(
    `INSERT INTO milestones (org_id, engagement_id, stage, title, detail, due_on, status, position, signed_off_by, signed_off_by_name, signed_off_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
    [harbor.id, eng.id, stage, title, extra.detail || null, extra.due || null, status, extra.position,
      extra.signed ? dana.id : null, extra.signed ? 'Dana Okafor' : null, extra.signed ? new Date(Date.now() - extra.signed * 864e5) : null]
  );
  await milestone('discovery', 'Process audit report', 'complete', { position: 1, signed: 30, detail: 'How rent rolls and T-12s are handled today, and where the time goes.' });
  await milestone('architecture', 'Sandbox walkthrough', 'complete', { position: 2, signed: 16 });
  await milestone('integration', 'Accounting export connection', 'in_progress', { position: 3, due: inDays(8) });
  const uat = await milestone('integration', 'UAT on 20 sample rent rolls', 'awaiting_signoff', { position: 4, due: inDays(3), detail: 'Results are in the shared folder. Sign off when your team agrees the extracted figures match.' });
  await milestone('production', 'Go-live', 'planned', { position: 5 });
  await asStaff('engagement.stage_changed', 'engagement', eng.id, { name: eng.name, from: 'architecture', to: 'integration' });
  await asStaff('engagement.milestone_ready', 'milestone', uat.id, { title: uat.title, engagementId: eng.id });

  const request = await q(
    `INSERT INTO action_items (org_id, engagement_id, kind, title, detail, due_on)
     VALUES ($1, $2, 'credentials', 'Send a read-only login for the accounting export', 'A user that can run the monthly export and nothing else.', $3) RETURNING *`,
    [harbor.id, eng.id, inDays(5)]
  );
  await asStaff('action.requested', 'action_item', request.id, { title: request.title, kind: 'credentials' });

  const workflow = (name, description, status, baseline) => q(
    `INSERT INTO workflows (user_id, org_id, name, description, status, trigger_type, baseline_minutes_per_run, baseline_basis, baseline_from)
     VALUES ($1, $2, $3, $4, $5, 'webhook', $6, $7, $8) RETURNING *`,
    [staff.id, harbor.id, name, description, status, baseline ? baseline.minutes : null, baseline ? baseline.basis : null, baseline ? baseline.from : null]
  );
  const run = (wf, daysAgo, status, durationMs, error) => q(
    `INSERT INTO workflow_executions (workflow_id, status, trigger_type, error_message, started_at, completed_at, duration_ms)
     VALUES ($1, $2, 'webhook', $3, NOW() - ($4 || ' days')::interval, NOW() - ($4 || ' days')::interval + ($5 || ' milliseconds')::interval, $6) RETURNING *`,
    [wf.id, status, error || null, String(daysAgo), String(durationMs), durationMs]
  );

  const rentRoll = await workflow('Rent roll intake', 'Reads each rent roll as it arrives, extracts units, tenants and rents, and checks that unit rents add up to the stated total.', 'active',
    { minutes: 25, basis: 'Agreed with Dana Okafor at kickoff: 25 minutes to key one rent roll by hand', from: utcDaysAgo(20) });
  // 2, 1, 3, 0 completed runs a day, repeating, for 40 days; two failures.
  for (let d = 0; d < 40; d++) {
    for (let i = 0; i < [2, 1, 3, 0][d % 4]; i++) await run(rentRoll, d, 'completed', 42000 + ((d * 7 + i * 13) % 50) * 1000);
  }
  await run(rentRoll, 2, 'failed', 8000, 'The file was password-protected and could not be opened.');
  await run(rentRoll, 9, 'failed', 5000, 'The file had no pages.');

  const t12 = await workflow('T-12 normalization', 'Maps each T-12 statement to your chart of accounts and checks that the twelve months add up to the annual figure.', 'active');
  await run(t12, 1, 'completed', 95000);
  const failed = await run(t12, 4, 'failed', 31000, 'Two months were missing from the statement.');
  await run(t12, 6, 'completed', 88000);
  for (const [level, message] of [
    ['info', 'Received Maple Court T-12 (4 pages)'], ['info', 'Mapped 38 of 38 line items to the chart of accounts'],
    ['debug', 'EXAMPLE_DATA debug line that clients must not see'], ['warn', 'Only 10 monthly columns found; expected 12'],
    ['error', 'Two months were missing from the statement.'],
  ]) {
    await pool.query("INSERT INTO execution_logs (user_id, workflow_execution_id, level, message, created_at) VALUES ($1, $2, $3, $4, clock_timestamp())", [staff.id, failed.id, level, message]);
  }

  const draft = await workflow('Offering memorandum summary (draft)', null, 'draft');
  await run(draft, 0, 'completed', 1000);
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
