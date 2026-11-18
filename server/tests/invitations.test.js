const h = require('./helpers');

afterAll(h.close);

const get = (token) => h.api().get(`/api/v1/auth/invitations/${token}`);
const accept = (token, body, cookie) => {
  const req = h.api().post(`/api/v1/auth/invitations/${token}/accept`);
  if (cookie) req.set('Cookie', cookie);
  return req.send(body || {});
};
const form = { firstName: 'Dana', lastName: 'Okafor', password: 'a long enough passphrase' };

describe('opening an invitation', () => {
  test('a valid link shows the firm, role and who sent it', async () => {
    const org = await h.createOrg({ name: 'Harbor Ridge Capital', vertical: 'INVESTMENT_FIRM' });
    const { user: inviter } = await h.member(org, 'admin', { firstName: 'Priya', lastName: 'Shah' });
    const { token } = await h.createInvitation(org, 'dana@example.test', 'reviewer', { invitedBy: inviter.id });
    const res = await get(token);
    expect(res.body.invitation).toMatchObject({
      state: 'valid', email: 'dana@example.test', role: 'reviewer', roleLabel: 'Operations / Analyst Reviewer',
      org: { name: 'Harbor Ridge Capital', vertical: 'INVESTMENT_FIRM' }, inviterName: 'Priya Shah', accountExists: false,
    });
    const row = await h.db.query('SELECT opened_at FROM invitations WHERE org_id = $1', [org.id]);
    expect(row.rows[0].opened_at).not.toBeNull();
  });

  test('expired links say so; unknown and revoked links reveal nothing', async () => {
    const org = await h.createOrg();
    const expired = await h.createInvitation(org, 'late@example.test', 'auditor', { expiresAt: new Date(Date.now() - 1000) });
    const revoked = await h.createInvitation(org, 'gone@example.test', 'auditor', { revoked: true });
    expect((await get(expired.token)).body.invitation.state).toBe('expired');
    expect((await get(revoked.token)).body.invitation).toEqual({ state: 'invalid' });
    expect((await get('ab'.repeat(32))).body.invitation).toEqual({ state: 'invalid' });
    expect((await get('not-a-token')).body.invitation).toEqual({ state: 'invalid' });
    expect(h.code(await accept(expired.token, form))).toBe('invitation_expired');
    expect(h.code(await accept(revoked.token, form))).toBe('invitation_invalid');
  });

  test('asking for a new invitation always answers the same and is limited to once an hour', async () => {
    const org = await h.createOrg();
    const expired = await h.createInvitation(org, 'late@example.test', 'auditor', { expiresAt: new Date(Date.now() - 1000) });
    const a = await h.api().post(`/api/v1/auth/invitations/${expired.token}/request-new`).send({});
    const first = (await h.db.query('SELECT renewal_requested_at FROM invitations WHERE id = $1', [expired.row.id])).rows[0].renewal_requested_at;
    const b = await h.api().post(`/api/v1/auth/invitations/${expired.token}/request-new`).send({});
    const second = (await h.db.query('SELECT renewal_requested_at FROM invitations WHERE id = $1', [expired.row.id])).rows[0].renewal_requested_at;
    const c = await h.api().post(`/api/v1/auth/invitations/${'cd'.repeat(32)}/request-new`).send({});
    expect([a.body, b.body, c.body]).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
    expect(first).not.toBeNull();
    expect(second.getTime()).toBe(first.getTime());
  });
});

describe('accepting an invitation', () => {
  test('a new person sets a password, joins with the invited role, and the link stops working', async () => {
    const org = await h.createOrg();
    const email = `${h.uniq('new')}@example.test`;
    const { token } = await h.createInvitation(org, email, 'reviewer');

    expect((await accept(token, { ...form, password: 'too short' })).status).toBe(400);
    const res = await accept(token, form);
    expect(res.status).toBe(201);
    expect(res.body.session.org.id).toBe(org.id);
    expect(res.body.session.role).toBe('reviewer');

    const user = (await h.db.query('SELECT * FROM users WHERE email = $1', [email])).rows[0];
    expect(user.role).toBe('viewer');              // least privilege for the older routes
    expect(user.is_platform_admin).toBe(false);
    expect(user.password_hash).toMatch(/^\$2/);
    expect(user.home_org_id).toBe(org.id);

    expect(h.code(await accept(token, form))).toBe('invitation_accepted');
    expect((await get(token)).body.invitation.state).toBe('accepted');
    const log = await h.db.query("SELECT actor_email FROM audit_log WHERE org_id = $1 AND action = 'invitation.accepted'", [org.id]);
    expect(log.rows[0].actor_email).toBe(email);
  });

  test('someone who already has a login must sign in as the invited address', async () => {
    const first = await h.createOrg();
    const second = await h.createOrg();
    const { user, cookie } = await h.member(first, 'admin');
    const stranger = await h.member(first, 'reviewer');
    const { token } = await h.createInvitation(second, user.email, 'auditor');

    expect((await get(token)).body.invitation.accountExists).toBe(true);
    expect(h.code(await accept(token, form))).toBe('account_exists');
    expect(h.code(await accept(token, {}, stranger.cookie))).toBe('email_mismatch');

    const res = await accept(token, {}, cookie);
    expect(res.status).toBe(201);
    expect(res.body.session.org.id).toBe(second.id);
    expect(res.body.session.role).toBe('auditor');
    expect(res.body.session.workspaces.length).toBe(2);
    // The password they already had is untouched.
    const after = (await h.db.query('SELECT password_hash FROM users WHERE id = $1', [user.id])).rows[0];
    expect(after.password_hash).toBe(user.password_hash);
  });

  test('accepting through SSO works only as the invited address', async () => {
    const org = await h.createOrg();
    const email = `${h.uniq('sso')}@example.test`;
    const { token } = await h.createInvitation(org, email, 'admin');

    const viaSso = async (as) => {
      const agent = h.agent();
      const start = await agent.get(`/api/v1/auth/sso/google/start?invite=${token}`);
      const state = new URL(start.headers.location, 'http://x').searchParams.get('state');
      return { agent, res: await agent.get('/api/v1/auth/sso/callback').query({ state, code: `google:${as}` }) };
    };

    const wrong = await viaSso('someone.else@example.test');
    expect(wrong.res.headers.location).toMatch(new RegExp(`/invite/${token}\\?error=email_mismatch`));
    expect((await h.db.query('SELECT 1 FROM users WHERE email = $1', ['someone.else@example.test'])).rows.length).toBe(0);

    const right = await viaSso(email);
    expect(right.res.headers.location).toMatch(/\/auth\/callback\?to=dashboard/);
    const session = (await right.agent.get('/api/v1/auth/session')).body.session;
    expect(session.role).toBe('admin');
    const user = (await h.db.query('SELECT password_hash FROM users WHERE email = $1', [email])).rows[0];
    expect(user.password_hash).toBeNull();
  });

  test('a firm that requires SSO does not accept a password on its invitations', async () => {
    const domain = `${h.uniq('bank')}.test`;
    const org = await h.createOrg({ domains: [domain], ssoProvider: 'microsoft', ssoRequired: true });
    const { token } = await h.createInvitation(org, `new@${domain}`, 'reviewer');
    expect((await get(token)).body.invitation.ssoRequired).toBe('microsoft');
    expect(h.code(await accept(token, form))).toBe('sso_required');
  });
});

describe('sending invitations', () => {
  test('an admin invites, resends (old link dies) and revokes', async () => {
    const org = await h.createOrg();
    const { cookie } = await h.member(org, 'admin');
    const post = (path, body) => h.api().post(`/api/v1/portal${path}`).set('Cookie', cookie).send(body || {});

    const created = await post('/invitations', { email: 'Analyst@Example.test', role: 'reviewer' });
    expect(created.status).toBe(201);
    expect(created.body.invitation.email).toBe('analyst@example.test');
    expect(JSON.stringify(created.body)).not.toMatch(/token/i);
    expect(h.code(await post('/invitations', { email: 'analyst@example.test', role: 'auditor' }))).toBe('already_invited');

    const resent = await post(`/invitations/${created.body.invitation.id}/resend`);
    expect(resent.status).toBe(201);
    const rows = (await h.db.query('SELECT id, revoked_at FROM invitations WHERE org_id = $1 ORDER BY created_at', [org.id])).rows;
    expect(rows.length).toBe(2);
    expect(rows.find((r) => r.id === created.body.invitation.id).revoked_at).not.toBeNull();

    const team = await h.api().get('/api/v1/portal/team').set('Cookie', cookie);
    expect(team.body.invitations.map((i) => i.id)).toEqual([resent.body.invitation.id]);

    const del = await h.api().delete(`/api/v1/portal/invitations/${resent.body.invitation.id}`).set('Cookie', cookie);
    expect(del.status).toBe(200);
    expect((await h.api().get('/api/v1/portal/team').set('Cookie', cookie)).body.invitations).toEqual([]);
  });

  test('existing members and outside domains are refused', async () => {
    const org = await h.createOrg({ domains: ['harborridge.test'] });
    const { user, cookie } = await h.member(org, 'admin', { email: `${h.uniq('pm')}@harborridge.test` });
    const post = (body) => h.api().post('/api/v1/portal/invitations').set('Cookie', cookie).send(body);
    expect(h.code(await post({ email: user.email, role: 'reviewer' }))).toBe('already_member');
    expect(h.code(await post({ email: 'someone@gmail.test', role: 'reviewer' }))).toBe('domain_not_allowed');
    expect(h.code(await post({ email: 'not-an-email', role: 'reviewer' }))).toBe('invalid_input');
    expect(h.code(await post({ email: 'ok@harborridge.test', role: 'owner' }))).toBe('invalid_input');
    expect((await post({ email: 'ok@harborridge.test', role: 'reviewer' })).status).toBe(201);
  });

  test('MonkFlow staff create a workspace and invite its first admin', async () => {
    const staff = await h.createUser({ platformAdmin: true });
    const cookie = await h.cookieFor(staff, null);
    const res = await h.api().post('/api/v1/admin/organizations').set('Cookie', cookie)
      .send({ name: 'Cedar Point Bank', vertical: 'BANK', allowedEmailDomains: ['cedarpoint.test'], sessionIdleMinutes: 15, adminEmail: 'coo@cedarpoint.test' });
    expect(res.status).toBe(201);
    expect(res.body.organization).toMatchObject({ name: 'Cedar Point Bank', vertical: 'BANK', sessionIdleMinutes: 15 });
    expect(res.body.invitation).toMatchObject({ email: 'coo@cedarpoint.test', role: 'admin' });
    const log = await h.db.query('SELECT action, actor_role FROM audit_log WHERE org_id = $1 ORDER BY id', [res.body.organization.id]);
    expect(log.rows).toEqual([
      { action: 'workspace.created', actor_role: 'monkflow_staff' },
      { action: 'invitation.sent', actor_role: 'monkflow_staff' },
    ]);

    // Inviting the same address again sends a fresh link and kills the old one.
    const orgId = res.body.organization.id;
    const again = await h.api().post(`/api/v1/admin/organizations/${orgId}/invitations`).set('Cookie', cookie).send({ email: 'COO@cedarpoint.test', role: 'admin' });
    expect(again.status).toBe(201);
    expect(again.body.invitation.id).not.toBe(res.body.invitation.id);
    const open = await h.db.query('SELECT id FROM invitations WHERE org_id = $1 AND revoked_at IS NULL', [orgId]);
    expect(open.rows.map((r) => r.id)).toEqual([again.body.invitation.id]);
    const last = await h.db.query('SELECT action, metadata FROM audit_log WHERE org_id = $1 ORDER BY id DESC LIMIT 1', [orgId]);
    expect(last.rows[0]).toMatchObject({ action: 'invitation.resent', metadata: { replaces: res.body.invitation.id } });

    // SSO cannot be required without the firm's domains.
    const bad = await h.api().post('/api/v1/admin/organizations').set('Cookie', cookie).send({ name: 'No Domains LLC', vertical: 'CRE', ssoProvider: 'google', ssoRequired: true });
    expect(bad.status).toBe(400);

    // Clients cannot reach staff routes at all.
    const org = await h.createOrg();
    const client = await h.member(org, 'admin');
    expect((await h.api().get('/api/v1/admin/organizations').set('Cookie', client.cookie)).status).toBe(403);
    // Nor the legacy team invite, which would email any address they name.
    expect((await h.api().post('/api/v1/team/invite').set('Cookie', client.cookie).send({ email: 'victim@example.test' })).status).toBe(403);
  });
});
