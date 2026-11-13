/**
 * Run portal queries for one workspace, isolated by the database.
 *
 *   const rows = await withOrg(req.session.orgId, (db) =>
 *     db.query('SELECT * FROM invitations'));     // only this workspace's rows
 *
 * Inside the callback the connection has switched to the monkflow_portal
 * role and app.org_id is set, so the row-level-security policies from
 * migration 051 apply: a query that forgets its WHERE still cannot return
 * or change another firm's rows. Both settings are transaction-local and
 * disappear at COMMIT or ROLLBACK, so the pooled connection goes back clean.
 *
 * Every client-facing portal route must use this. Code that runs before a
 * workspace is known (sign-in, invitation lookup by token) and MonkFlow's
 * own admin routes use config/database.js directly.
 */
const { getClient } = require('../config/database');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function withOrg(orgId, fn) {
  if (!UUID.test(String(orgId || ''))) throw new Error('withOrg: a workspace id is required');
  const client = await getClient();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE monkflow_portal');
    await client.query("SELECT set_config('app.org_id', $1, true)", [orgId]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* connection already gone */ }
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { withOrg, UUID };
