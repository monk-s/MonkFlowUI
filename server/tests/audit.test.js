const h = require('./helpers');

afterAll(h.close);

const get = (who, path) => h.api().get(`/api/v1/portal${path}`).set('Cookie', who.cookie);

describe('the audit log', () => {
  let org, admin, reviewer, auditor, other;
  beforeAll(async () => {
    org = await h.createOrg();
    admin = await h.member(org, 'admin');
    reviewer = await h.member(org, 'reviewer');
    auditor = await h.member(org, 'auditor');
    other = await h.member(await h.createOrg(), 'admin');
    // Two real entries in this workspace, one in another.
    await h.api().post('/api/v1/portal/invitations').set('Cookie', admin.cookie).send({ email: 'one@example.test', role: 'reviewer' });
    await h.api().post('/api/v1/portal/invitations').set('Cookie', admin.cookie).send({ email: 'two@example.test', role: 'auditor' });
    await h.api().post('/api/v1/portal/invitations').set('Cookie', other.cookie).send({ email: 'elsewhere@example.test', role: 'reviewer' });
  });

  test('admins and auditors read it; reviewers and other workspaces do not', async () => {
    expect((await get(reviewer, '/audit')).status).toBe(404);
    expect((await get(reviewer, '/audit/export')).status).toBe(404);
    const res = await get(auditor, '/audit');
    expect(res.status).toBe(200);
    expect(res.body.entries.map((e) => e.action)).toEqual(['invitation.sent', 'invitation.sent']);
    expect(res.body.entries[0]).toMatchObject({ actorEmail: admin.user.email, detail: 'role: auditor, email: two@example.test' });
    expect(JSON.stringify(res.body)).not.toContain('elsewhere@example.test');
    expect(res.body.chain).toEqual({ ok: true, entries: 2 });
  });

  test('filters by person, action and date', async () => {
    expect((await get(admin, '/audit?q=invitation')).body.entries).toHaveLength(2);
    expect((await get(admin, `/audit?q=${encodeURIComponent(admin.user.email)}`)).body.entries).toHaveLength(2);
    expect((await get(admin, '/audit?q=no-such-thing')).body.entries).toHaveLength(0);
    expect((await get(admin, '/audit?q=%25')).body.entries).toHaveLength(0);   // % is text, not a wildcard
    expect((await get(admin, '/audit?to=2000-01-01')).body.entries).toHaveLength(0);
    const first = (await get(admin, '/audit')).body.entries[0];
    expect((await get(admin, `/audit?before=${first.id}`)).body.entries).toHaveLength(1);
  });

  test('an export is a CSV of the same rows, and is itself logged', async () => {
    const res = await get(admin, '/audit/export?q=invitation');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.text.trim().split('\r\n')).toHaveLength(3);
    const after = await get(admin, '/audit');
    expect(after.body.entries[0]).toMatchObject({ action: 'audit.exported', detail: expect.stringContaining('entries: 2') });
    expect(after.body.chain).toEqual({ ok: true, entries: 3 });
  });

  test('a tampered row is reported as a broken chain', async () => {
    const o = await h.createOrg();
    const a = await h.member(o, 'admin');
    await h.api().post('/api/v1/portal/invitations').set('Cookie', a.cookie).send({ email: 'x@example.test', role: 'reviewer' });
    await h.api().post('/api/v1/portal/invitations').set('Cookie', a.cookie).send({ email: 'y@example.test', role: 'reviewer' });
    // Only someone who can switch off the table's triggers could do this.
    await h.db.query('ALTER TABLE audit_log DISABLE TRIGGER trg_audit_no_update');
    try { await h.db.query("UPDATE audit_log SET action = 'invitation.revoked' WHERE id = (SELECT min(id) FROM audit_log WHERE org_id = $1)", [o.id]); }
    finally { await h.db.query('ALTER TABLE audit_log ENABLE TRIGGER trg_audit_no_update'); }
    expect((await get(a, '/audit')).body.chain).toEqual({ ok: false, entries: 2 });
  });
});
