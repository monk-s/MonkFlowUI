const h = require('./helpers');
const { PERMISSIONS, permissionsFor, can } = require('../src/portal/permissions');

afterAll(h.close);

describe('role matrix', () => {
  test('matches the published table', () => {
    const allowed = (p) => ['admin', 'reviewer', 'auditor'].filter((r) => can(r, p));
    expect(allowed('review.view')).toEqual(['admin', 'reviewer', 'auditor']);
    expect(allowed('review.decide')).toEqual(['admin', 'reviewer']);
    expect(allowed('engagement.signoff')).toEqual(['admin']);
    expect(allowed('actions.complete')).toEqual(['admin', 'reviewer']);
    expect(allowed('proposals.approve')).toEqual(['admin']);
    expect(allowed('connectors.view')).toEqual(['admin', 'reviewer', 'auditor']);
    expect(allowed('connectors.manage')).toEqual(['admin']);
    expect(allowed('vault.view_agreements')).toEqual(['admin', 'reviewer']);
    expect(allowed('requests.create')).toEqual(['admin', 'reviewer']);
    expect(allowed('team.manage')).toEqual(['admin']);
    expect(allowed('security.manage')).toEqual(['admin']);
    expect(allowed('audit.view')).toEqual(['admin', 'auditor']);
    expect(allowed('data.export')).toEqual(['admin', 'reviewer', 'auditor']);
  });

  test('an auditor holds no permission that changes anything', () => {
    const writes = ['review.decide', 'engagement.signoff', 'actions.complete', 'proposals.approve', 'connectors.manage', 'requests.create', 'messages.send', 'team.manage', 'security.manage'];
    expect(permissionsFor('auditor').filter((p) => writes.includes(p))).toEqual([]);
  });

  test('unknown roles and permissions get nothing', () => {
    expect(permissionsFor('owner')).toEqual([]);
    expect(can('admin', 'made.up')).toBe(false);
    expect(permissionsFor('monkflow_staff').length).toBe(Object.keys(PERMISSIONS).length);
  });
});

describe('enforced by the API', () => {
  let org, admin, reviewer, auditor;
  beforeAll(async () => {
    org = await h.createOrg();
    admin = await h.member(org, 'admin');
    reviewer = await h.member(org, 'reviewer');
    auditor = await h.member(org, 'auditor');
  });

  test('only admins can invite, change roles or remove people', async () => {
    for (const who of [reviewer, auditor]) {
      const c = who.cookie;
      const results = await Promise.all([
        h.api().post('/api/v1/portal/invitations').set('Cookie', c).send({ email: 'x@example.test', role: 'admin' }),
        h.api().patch(`/api/v1/portal/team/${who.membership.id}`).set('Cookie', c).send({ role: 'admin' }),
        h.api().delete(`/api/v1/portal/team/${admin.membership.id}`).set('Cookie', c),
      ]);
      expect(results.map((r) => r.status)).toEqual([404, 404, 404]);
    }
    const roles = (await h.db.query('SELECT role FROM memberships WHERE org_id = $1 ORDER BY role', [org.id])).rows.map((r) => r.role);
    expect(roles).toEqual(['admin', 'auditor', 'reviewer']);
  });

  test('everyone can see who has access, only admins see pending invitations', async () => {
    await h.createInvitation(org, 'pending@example.test', 'reviewer');
    const forAuditor = await h.api().get('/api/v1/portal/team').set('Cookie', auditor.cookie);
    expect(forAuditor.body.members.length).toBe(3);
    expect(forAuditor.body.invitations).toEqual([]);
    const forAdmin = await h.api().get('/api/v1/portal/team').set('Cookie', admin.cookie);
    expect(forAdmin.body.invitations.length).toBe(1);
    expect(JSON.stringify(forAdmin.body)).not.toMatch(/password_hash|token_hash/);
  });

  test('the last admin cannot be removed, demoted or suspended', async () => {
    const id = admin.membership.id;
    const c = admin.cookie;
    const results = await Promise.all([
      h.api().delete(`/api/v1/portal/team/${id}`).set('Cookie', c),
      h.api().patch(`/api/v1/portal/team/${id}`).set('Cookie', c).send({ role: 'reviewer' }),
      h.api().patch(`/api/v1/portal/team/${id}`).set('Cookie', c).send({ status: 'suspended' }),
    ]);
    expect(results.map((r) => h.code(r))).toEqual(['last_admin', 'last_admin', 'last_admin']);
  });

  test('a role change takes effect on the very next request and is logged', async () => {
    const res = await h.api().patch(`/api/v1/portal/team/${reviewer.membership.id}`).set('Cookie', admin.cookie).send({ role: 'admin' });
    expect(res.status).toBe(200);
    const session = await h.api().get('/api/v1/auth/session').set('Cookie', reviewer.cookie);
    expect(session.body.session.role).toBe('admin');
    expect(session.body.session.permissions).toContain('team.manage');
    const log = (await h.db.query("SELECT actor_email, metadata FROM audit_log WHERE org_id = $1 AND action = 'team.role_changed'", [org.id])).rows[0];
    expect(log.actor_email).toBe(admin.user.email);
    expect(log.metadata).toMatchObject({ from: 'reviewer', to: 'admin' });
  });

  test('removing someone ends their access immediately', async () => {
    expect((await h.api().get('/api/v1/portal/team').set('Cookie', auditor.cookie)).status).toBe(200);
    const res = await h.api().delete(`/api/v1/portal/team/${auditor.membership.id}`).set('Cookie', admin.cookie);
    expect(res.status).toBe(200);
    expect((await h.api().get('/api/v1/portal/team').set('Cookie', auditor.cookie)).status).toBe(401);
  });
});

describe('audit log', () => {
  test('rows cannot be changed, deleted or truncated, even by the database owner', async () => {
    const org = await h.createOrg();
    await h.member(org, 'admin');
    const { audit } = require('../src/portal/audit');
    await audit(null, null, { orgId: org.id, action: 'test.one' });
    await expect(h.db.query("UPDATE audit_log SET action = 'edited' WHERE org_id = $1", [org.id])).rejects.toThrow(/append-only/);
    await expect(h.db.query('DELETE FROM audit_log WHERE org_id = $1', [org.id])).rejects.toThrow(/append-only/);
    await expect(h.db.query('TRUNCATE audit_log')).rejects.toThrow(/append-only/);
    const { rows } = await h.db.query('SELECT action FROM audit_log WHERE org_id = $1', [org.id]);
    expect(rows).toEqual([{ action: 'test.one' }]);
  });

  test('each row is chained to the one before it in the same workspace', async () => {
    const org = await h.createOrg();
    const { audit } = require('../src/portal/audit');
    await Promise.all([1, 2, 3, 4, 5].map((i) => audit(null, null, { orgId: org.id, action: `test.concurrent_${i}` })));
    const { rows } = await h.db.query('SELECT prev_hash, row_hash FROM audit_log WHERE org_id = $1 ORDER BY id', [org.id]);
    expect(rows.length).toBe(5);
    expect(rows[0].prev_hash).toBeNull();
    for (let i = 1; i < rows.length; i++) expect(rows[i].prev_hash).toBe(rows[i - 1].row_hash);
    expect(new Set(rows.map((r) => r.row_hash)).size).toBe(5);
    expect(rows.every((r) => /^[0-9a-f]{64}$/.test(r.row_hash))).toBe(true);
  });

  test('removing a user leaves their trail intact', async () => {
    const org = await h.createOrg();
    const keep = await h.member(org, 'admin');
    const leaver = await h.member(org, 'reviewer');
    const { audit } = require('../src/portal/audit');
    await audit(null, null, { orgId: org.id, actorUserId: leaver.user.id, actorEmail: leaver.user.email, action: 'test.did_something' });
    await h.db.query('DELETE FROM users WHERE id = $1', [leaver.user.id]);
    const { rows } = await h.db.query("SELECT actor_email FROM audit_log WHERE org_id = $1 AND action = 'test.did_something'", [org.id]);
    expect(rows[0].actor_email).toBe(leaver.user.email);
    expect(keep.user.id).toBeTruthy();
  });
});
