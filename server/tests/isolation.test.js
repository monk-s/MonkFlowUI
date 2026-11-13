/**
 * Workspace isolation. Two firms, A and B. Everything here asserts that a
 * person in A cannot read or change anything of B's, first through the API
 * and then directly against the database policies the API relies on.
 *
 * The sign-in screen says "your firm's data is isolated from every other
 * client". This file is what makes that sentence true; extend it whenever a
 * portal route or table is added.
 */
const h = require('./helpers');
const { withOrg } = require('../src/portal/withOrg');
const { audit } = require('../src/portal/audit');

let A, B, adminA, adminB, reviewerB, inviteB;

beforeAll(async () => {
  A = await h.createOrg({ name: 'Firm A' });
  B = await h.createOrg({ name: 'Firm B' });
  adminA = await h.member(A, 'admin');
  adminB = await h.member(B, 'admin');
  reviewerB = await h.member(B, 'reviewer');
  inviteB = await h.createInvitation(B, 'pending@firm-b.test', 'auditor');
  await h.createInvitation(A, 'pending@firm-a.test', 'auditor');
  await audit(null, null, { orgId: A.id, action: 'test.event_a' });
  await audit(null, null, { orgId: B.id, action: 'test.event_b' });
});
afterAll(h.close);

const as = (who) => ({
  get: (p) => h.api().get(`/api/v1/portal${p}`).set('Cookie', who.cookie),
  post: (p, b) => h.api().post(`/api/v1/portal${p}`).set('Cookie', who.cookie).send(b || {}),
  patch: (p, b) => h.api().patch(`/api/v1/portal${p}`).set('Cookie', who.cookie).send(b || {}),
  del: (p) => h.api().delete(`/api/v1/portal${p}`).set('Cookie', who.cookie),
});

describe('through the API', () => {
  test('lists show only the caller\'s workspace', async () => {
    const team = await as(adminA).get('/team');
    expect(team.body.members.map((m) => m.email)).toEqual([adminA.user.email]);
    expect(team.body.invitations.map((i) => i.email)).toEqual(['pending@firm-a.test']);
    expect((await as(adminA).get('/workspace')).body.workspace.name).toBe('Firm A');
  });

  test('another workspace\'s ids answer 404 and nothing changes', async () => {
    const m = reviewerB.membership.id;
    const i = inviteB.row.id;
    const attempts = await Promise.all([
      as(adminA).patch(`/team/${m}`, { role: 'admin' }),
      as(adminA).patch(`/team/${m}`, { status: 'suspended' }),
      as(adminA).del(`/team/${m}`),
      as(adminA).del(`/invitations/${i}`),
      as(adminA).post(`/invitations/${i}/resend`),
    ]);
    expect(attempts.map((r) => r.status)).toEqual([404, 404, 404, 404, 404]);

    const member = (await h.db.query('SELECT role, status FROM memberships WHERE id = $1', [m])).rows[0];
    expect(member).toEqual({ role: 'reviewer', status: 'active' });
    const invitation = (await h.db.query('SELECT revoked_at FROM invitations WHERE id = $1', [i])).rows[0];
    expect(invitation.revoked_at).toBeNull();
    // B's reviewer is still signed in.
    expect((await as(reviewerB).get('/team')).status).toBe(200);
  });

  test('a session cannot be pointed at a workspace the person is not in', async () => {
    const res = await h.api().post('/api/v1/auth/session/workspace').set('Cookie', adminA.cookie).send({ orgId: B.id });
    expect(res.status).toBe(404);
    expect((await as(adminA).get('/workspace')).body.workspace.name).toBe('Firm A');
  });

  test('malformed ids are a 404, not an error', async () => {
    expect((await as(adminA).del('/team/not-a-uuid')).status).toBe(404);
    expect((await as(adminA).del("/invitations/1' OR '1'='1")).status).toBe(404);
  });
});

describe('in the database, even when a query forgets its WHERE', () => {
  test('reads return only the current workspace', async () => {
    const rows = await withOrg(A.id, async (db) => ({
      orgs: (await db.query('SELECT name FROM organizations')).rows,
      memberships: (await db.query('SELECT org_id FROM memberships')).rows,
      invitations: (await db.query('SELECT email FROM invitations')).rows,
      audit: (await db.query("SELECT action FROM audit_log WHERE action LIKE 'test.%'")).rows,
      members: (await db.query('SELECT email FROM org_members')).rows,
    }));
    expect(rows.orgs).toEqual([{ name: 'Firm A' }]);
    expect(rows.memberships.every((r) => r.org_id === A.id)).toBe(true);
    expect(rows.invitations).toEqual([{ email: 'pending@firm-a.test' }]);
    expect(rows.audit).toEqual([{ action: 'test.event_a' }]);
    expect(rows.members).toEqual([{ email: adminA.user.email }]);
  });

  test('writes cannot touch or create another workspace\'s rows', async () => {
    const touched = await withOrg(A.id, async (db) => ({
      members: (await db.query("UPDATE memberships SET role = 'auditor' WHERE org_id = $1", [B.id])).rowCount,
      all: (await db.query("UPDATE invitations SET revoked_at = NOW() WHERE email LIKE 'pending@firm-b%'")).rowCount,
      org: (await db.query("UPDATE organizations SET name = 'Hijacked' WHERE id = $1", [B.id])).rowCount,
      gone: (await db.query('DELETE FROM memberships WHERE org_id = $1', [B.id])).rowCount,
    }));
    expect(touched).toEqual({ members: 0, all: 0, org: 0, gone: 0 });

    await expect(withOrg(A.id, (db) => db.query(
      "INSERT INTO invitations (org_id, email, role, token_hash, expires_at) VALUES ($1, 'x@x.test', 'admin', 'h', NOW() + INTERVAL '1 day')", [B.id]
    ))).rejects.toThrow(/row-level security/);
    await expect(withOrg(A.id, (db) => db.query(
      "INSERT INTO memberships (org_id, user_id, role) VALUES ($1, $2, 'admin')", [B.id, adminA.user.id]
    ))).rejects.toThrow(/row-level security/);
    await expect(withOrg(A.id, (db) => audit(db, null, { orgId: B.id, action: 'test.forged' }))).rejects.toThrow(/row-level security/);
  });

  test('the portal role cannot read the users or sessions tables at all', async () => {
    await expect(withOrg(A.id, (db) => db.query('SELECT email, password_hash FROM users'))).rejects.toThrow(/permission denied/);
    await expect(withOrg(A.id, (db) => db.query('SELECT token_hash FROM sessions'))).rejects.toThrow(/permission denied/);
    await expect(withOrg(A.id, (db) => db.query('SELECT * FROM workflows'))).rejects.toThrow(/permission denied/);
  });

  test('the workspace setting does not leak to the next query on the same connection', async () => {
    await withOrg(A.id, (db) => db.query('SELECT 1'));
    const { rows } = await h.db.query("SELECT current_user AS role, current_setting('app.org_id', true) AS org");
    expect(rows[0].role).not.toBe('monkflow_portal');
    expect(rows[0].org || '').toBe('');
    // and a failed transaction resets it too
    await withOrg(A.id, (db) => db.query('SELECT 1/0')).catch(() => {});
    const again = await h.db.query('SELECT current_user AS role');
    expect(again.rows[0].role).not.toBe('monkflow_portal');
  });

  test('withOrg refuses to run without a workspace', async () => {
    await expect(withOrg(null, (db) => db.query('SELECT 1'))).rejects.toThrow(/workspace id is required/);
    await expect(withOrg("x'; RESET ROLE; --", (db) => db.query('SELECT 1'))).rejects.toThrow(/workspace id is required/);
  });
});
