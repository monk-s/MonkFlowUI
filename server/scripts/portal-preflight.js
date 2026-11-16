#!/usr/bin/env node
/**
 * Portal v2 preflight. READ-ONLY: run this against production BEFORE the
 * portal branch is merged. It changes nothing; every query runs inside a
 * read-only transaction that is rolled back at the end.
 *
 *   cd server
 *   DATABASE_URL="<the Railway public connection string>" node scripts/portal-preflight.js
 *
 * (DATABASE_PUBLIC_URL is used if DATABASE_URL is not set.)
 *
 * It answers three questions:
 *   1. Will migrations 048-052 apply cleanly to this database?
 *   2. Who has an account today, and who has actually been signing in?
 *      (Their passwords keep working, but they land on the new console.)
 *   3. What will the backfill create (one workspace per client account)?
 *
 * Exit code 0 = nothing blocking, 1 = at least one BLOCKER, 2 = could not run.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const url = process.env.DATABASE_URL || process.env.DATABASE_PUBLIC_URL;
if (!url) {
  console.error('Set DATABASE_URL (or DATABASE_PUBLIC_URL) to the database to inspect.');
  process.exit(2);
}

const NEW_MIGRATIONS = ['048-organizations.sql', '049-sessions-invitations.sql', '050-org-scope-backfill.sql', '051-audit-log-rls.sql', '052-engagements.sql'];
const NEW_TABLES = ['organizations', 'memberships', 'invitations', 'sessions', 'audit_log'];
const SCOPED_TABLES = ['workflows', 'agents', 'projects', 'user_integrations', 'api_keys'];

const blockers = [];
const warnings = [];
const section = (title) => console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 58 - title.length))}`);
const line = (label, value) => console.log(`  ${String(label).padEnd(38)} ${value}`);
const day = (d) => (d ? new Date(d).toISOString().slice(0, 10) : 'never');
// Show enough of an address to recognise it without printing it in full.
const mask = (email) => String(email || '').replace(/^(.{2})[^@]*(@.*)$/, '$1***$2');

(async () => {
  const pool = new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 10000 });
  const db = await pool.connect();
  const q = async (text, params) => (await db.query(text, params)).rows;
  try {
    await db.query('BEGIN TRANSACTION READ ONLY');
    await db.query("SET LOCAL statement_timeout = '15s'");

    const [{ db: dbName, usr, version }] = await q('SELECT current_database() AS db, current_user AS usr, version() AS version');
    section('Database');
    line('Database / user', `${dbName} / ${usr}`);
    line('Server', version.split(',')[0]);

    // ── 1. Migrations ───────────────────────────────────────────
    section('Migrations');
    const hasTable = async (name) => (await q('SELECT to_regclass($1) AS t', [`public.${name}`]))[0].t !== null;
    if (!(await hasTable('_migrations'))) {
      blockers.push('There is no _migrations table. This does not look like the MonkFlow database.');
    } else {
      const applied = new Set((await q('SELECT name FROM _migrations')).map((r) => r.name));
      const onDisk = fs.readdirSync(path.join(__dirname, '..', 'migrations')).filter((f) => f.endsWith('.sql')).sort();
      const pending = onDisk.filter((f) => !applied.has(f));
      const pendingOld = pending.filter((f) => !NEW_MIGRATIONS.includes(f));
      line('Applied', applied.size);
      line('Pending', pending.length ? pending.join(', ') : 'none');
      if (pendingOld.length) {
        warnings.push(`Older migrations are not recorded as applied: ${pendingOld.join(', ')}. The server retries these on every boot; check why before adding more.`);
      }
      const already = NEW_MIGRATIONS.filter((f) => applied.has(f));
      if (already.length) line('Portal migrations already applied', already.join(', '));
    }

    for (const table of NEW_TABLES) {
      if (await hasTable(table)) {
        const applied = (await q('SELECT 1 FROM _migrations WHERE name = ANY($1)', [NEW_MIGRATIONS])).length;
        if (!applied) blockers.push(`A table named "${table}" already exists but the portal migrations have not run. The migration would skip creating it (IF NOT EXISTS) and then fail on missing columns.`);
      }
    }
    if (!(await hasTable('users'))) blockers.push('There is no users table.');
    for (const table of SCOPED_TABLES) {
      if (!(await hasTable(table))) blockers.push(`Table "${table}" is missing; migration 050 adds a column to it and would fail.`);
    }
    // Migration 052 adds columns and views over these, and creates three tables.
    for (const table of ['workflow_executions', 'execution_logs']) {
      if (!(await hasTable(table))) blockers.push(`Table "${table}" is missing; migration 052 builds the portal's read-only views on it and would fail.`);
    }
    for (const table of ['engagements', 'milestones', 'action_items']) {
      if ((await hasTable(table)) && !(await q("SELECT 1 FROM _migrations WHERE name = '052-engagements.sql'")).length) {
        blockers.push(`A table named "${table}" already exists but migration 052 has not run. The migration would skip creating it (IF NOT EXISTS) and then fail on missing columns.`);
      }
    }
    const userCols = new Set((await q("SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users'")).map((r) => r.column_name));
    for (const col of ['id', 'email', 'role', 'first_name', 'last_name', 'company', 'password_hash']) {
      if (!userCols.has(col)) blockers.push(`users.${col} does not exist; the backfill reads it.`);
    }

    // Migration 051 creates the restricted role the portal runs under.
    const [me] = await q('SELECT rolsuper, rolcreaterole FROM pg_roles WHERE rolname = current_user');
    const [role] = await q("SELECT 1 AS ok FROM pg_roles WHERE rolname = 'monkflow_portal'");
    line('Can create roles', me.rolsuper ? 'yes (superuser)' : me.rolcreaterole ? 'yes' : 'NO');
    line('Role monkflow_portal', role ? 'exists' : 'not yet (migration 051 creates it)');
    if (!role && !me.rolsuper && !me.rolcreaterole) {
      blockers.push('This database user cannot create roles, so migration 051 would fail and every portal page would error. Create the role by hand as an admin first: CREATE ROLE monkflow_portal NOLOGIN;');
    }
    const [{ ok: hasGenUuid }] = await q("SELECT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'gen_random_uuid') AS ok");
    if (!hasGenUuid) blockers.push('gen_random_uuid() is not available (needs Postgres 13+ or the pgcrypto extension).');

    // ── 2. Accounts ─────────────────────────────────────────────
    if (userCols.has('email') && userCols.has('role')) {
      section('Accounts today');
      const byRole = await q('SELECT role, count(*)::int AS n FROM users GROUP BY role ORDER BY n DESC');
      byRole.forEach((r) => line(`role = ${r.role}`, r.n));

      const dupes = await q('SELECT lower(email) AS email, count(*)::int AS n FROM users GROUP BY lower(email) HAVING count(*) > 1');
      if (dupes.length) blockers.push(`${dupes.length} email address(es) exist more than once when letter case is ignored (${dupes.map((d) => mask(d.email)).join(', ')}). Sign-in looks accounts up by lower-cased email, so merge or rename these first.`);

      const staff = await q("SELECT email FROM users WHERE role = 'superadmin'");
      line('Will become MonkFlow staff', staff.length ? staff.map((s) => s.email).join(', ') : 'NOBODY');
      if (!staff.length) blockers.push("No account has role 'superadmin', so nobody would be able to open /admin or create workspaces after the change.");

      // Sign-in activity. The old system issued a refresh token at each
      // sign-in and at each silent renewal, so the newest one per person is
      // a fair "last used the portal" date.
      if (await hasTable('refresh_tokens')) {
        const people = await q(`
          SELECT u.email, u.role, u.created_at,
                 (SELECT max(t.created_at) FROM refresh_tokens t WHERE t.user_id = u.id) AS last_token,
                 (SELECT count(*)::int FROM workflows w WHERE w.user_id = u.id) AS workflows,
                 (SELECT count(*)::int FROM projects p WHERE p.user_id = u.id) AS projects
            FROM users u
           WHERE u.role <> 'superadmin'
           ORDER BY last_token DESC NULLS LAST, u.created_at DESC`);
        const cutoff = Date.now() - 60 * 864e5;
        const active = people.filter((p) => p.last_token && new Date(p.last_token).getTime() > cutoff);
        section(`Client accounts (${people.length}), most recently active first`);
        console.log(`  ${'email'.padEnd(34)} ${'created'.padEnd(11)} ${'last active'.padEnd(11)} tools  projects`);
        people.slice(0, 40).forEach((p) => console.log(`  ${mask(p.email).padEnd(34)} ${day(p.created_at).padEnd(11)} ${day(p.last_token).padEnd(11)} ${String(p.workflows).padEnd(6)} ${p.projects}`));
        if (people.length > 40) console.log(`  ... and ${people.length - 40} more`);
        console.log('');
        line('Active in the last 60 days', active.length);
        if (active.length) {
          warnings.push(`${active.length} client account(s) signed in during the last 60 days. Tell them before the cut-over: their password keeps working, but they sign in at /sign-in and land on the new console, which is mostly empty until Phase 2.`);
        }
      }

      // ── 3. Backfill ───────────────────────────────────────────
      section('What the backfill will create');
      const [{ n: clients }] = await q("SELECT count(*)::int AS n FROM users WHERE role <> 'superadmin'");
      line('Workspaces (one per client account)', clients);
      const unnamed = (await q("SELECT count(*)::int AS n FROM users WHERE role <> 'superadmin' AND NULLIF(btrim(COALESCE(company, '')), '') IS NULL"))[0].n;
      line('...of which have no company name', `${unnamed} (named after the person instead)`);
      if (unnamed) warnings.push(`${unnamed} workspace(s) will be named after a person because the account has no company. Rename them under Admin > Client Workspaces after the migration.`);
      warnings.push('Every backfilled workspace is typed "Investment firm". Set the right type for each under Admin > Client Workspaces.');
      for (const table of SCOPED_TABLES) {
        if (await hasTable(table)) line(`Rows to tag in ${table}`, (await q(`SELECT count(*)::int AS n FROM ${table}`))[0].n);
      }
      if (await hasTable('team_members')) {
        const team = await q('SELECT status, count(*)::int AS n FROM team_members GROUP BY status');
        line('Old team_members rows', team.length ? team.map((t) => `${t.n} ${t.status}`).join(', ') : 'none');
        if (team.length) warnings.push('Old team invitations were never usable and are NOT carried over. Re-invite those people from the new Team screen if they are real.');
      }
    }
  } catch (err) {
    console.error(`\nPreflight could not finish: ${err.message}`);
    process.exitCode = 2;
  } finally {
    await db.query('ROLLBACK').catch(() => {});
    db.release();
    await pool.end();
  }

  if (process.exitCode === 2) return;
  section('Result');
  warnings.forEach((w) => console.log(`  NOTE     ${w}`));
  blockers.forEach((b) => console.log(`  BLOCKER  ${b}`));
  console.log(blockers.length ? `\n  ${blockers.length} blocker(s). Do not merge the portal branch yet.` : '\n  Nothing blocking. Nothing was changed.');
  process.exitCode = blockers.length ? 1 : 0;
})().catch((err) => { console.error(`Preflight could not run: ${err.message}`); process.exit(2); });
