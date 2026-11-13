const h = require('./helpers');
const stub = require('../src/services/identity/stub');

afterAll(h.close);

const signIn = (agent, email, password = h.PASSWORD) => agent.post('/api/v1/auth/sign-in').send({ email, password });

describe('account creation', () => {
  test('there is no open signup', async () => {
    const res = await h.api().post('/api/v1/auth/signup').send({ email: 'x@example.test', password: 'whatever-long-enough', firstName: 'A', lastName: 'B' });
    expect(res.status).toBe(404);
  });
});

describe('password sign-in', () => {
  test('wrong password is refused with a generic message and logged', async () => {
    const org = await h.createOrg();
    const { user } = await h.member(org, 'admin');
    const res = await signIn(h.agent(), user.email, 'not the password');
    expect(res.status).toBe(401);
    expect(h.code(res)).toBe('invalid_credentials');
    const unknown = await signIn(h.agent(), 'nobody@example.test', 'not the password');
    expect(unknown.status).toBe(401);
    expect(unknown.body.error.message).toBe(res.body.error.message);
    const log = await h.db.query("SELECT 1 FROM audit_log WHERE action = 'auth.sign_in_failed' AND actor_email = $1", [user.email]);
    expect(log.rows.length).toBe(1);
  });

  test('a new password account must add a second factor before reading workspace data', async () => {
    const org = await h.createOrg();
    const { user } = await h.member(org, 'admin');
    const agent = h.agent();
    const res = await signIn(agent, user.email);
    expect(res.status).toBe(200);
    expect(res.body.next).toBe('mfa-setup');
    const setCookie = res.headers['set-cookie'].join('\n');
    expect(setCookie).toMatch(/mf_session=[0-9a-f]+;.*HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(JSON.stringify(res.body)).not.toMatch(/token/i);

    const blocked = await agent.get('/api/v1/portal/team');
    expect(blocked.status).toBe(403);
    expect(h.code(blocked)).toBe('mfa_setup_required');

    const enroll = await agent.post('/api/v1/auth/mfa/enroll').send({});
    expect(enroll.body.otpauthUrl).toMatch(/^otpauth:/);
    const bad = await agent.post('/api/v1/auth/mfa/enroll/confirm').send({ factorId: enroll.body.factorId, code: '111111' });
    expect(h.code(bad)).toBe('invalid_code');
    const ok = await agent.post('/api/v1/auth/mfa/enroll/confirm').send({ factorId: enroll.body.factorId, code: stub.MFA_CODE });
    expect(ok.body.next).toBe('dashboard');
    expect((await agent.get('/api/v1/portal/team')).status).toBe(200);
  });

  test('an enrolled account is challenged for its code on the next sign-in', async () => {
    const org = await h.createOrg();
    const { user } = await h.member(org, 'reviewer', { mfaEnrolled: true });
    const agent = h.agent();
    const first = await signIn(agent, user.email);
    expect(first.body).toEqual({ next: 'mfa' });
    expect((await agent.get('/api/v1/auth/session')).status).toBe(401);

    expect(h.code(await agent.post('/api/v1/auth/mfa/verify').send({ code: '999999' }))).toBe('invalid_code');
    const done = await agent.post('/api/v1/auth/mfa/verify').send({ code: stub.MFA_CODE });
    expect(done.body.next).toBe('dashboard');
    expect(done.body.session.mfaVerified).toBe(true);
    expect(done.body.session.role).toBe('reviewer');
    expect(done.body.session.permissions).toContain('review.decide');
    expect(done.body.session.permissions).not.toContain('team.manage');
  });

  test('the session cookie also authenticates the older API routes', async () => {
    const org = await h.createOrg();
    const { user, cookie } = await h.member(org, 'admin');
    const res = await h.api().get('/api/v1/users/me').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(user.email);
    expect(res.body.user.password_hash).toBeUndefined();
  });

  test('a login with no workspace is told so and gets no session', async () => {
    const user = await h.createUser();
    const agent = h.agent();
    const res = await signIn(agent, user.email);
    expect(res.status).toBe(403);
    expect(h.code(res)).toBe('no_workspace');
    expect((await agent.get('/api/v1/auth/session')).status).toBe(401);
  });
});

describe('workspaces', () => {
  test('someone in two workspaces picks one, and cannot pick a third', async () => {
    const a = await h.createOrg({ name: 'Alpha Fund I' });
    const b = await h.createOrg({ name: 'Alpha Fund II' });
    const other = await h.createOrg();
    const user = await h.createUser({ mfaEnrolled: true });
    await h.addMember(a, user, 'admin');
    await h.addMember(b, user, 'auditor');

    const agent = h.agent();
    await signIn(agent, user.email);
    const res = await agent.post('/api/v1/auth/mfa/verify').send({ code: stub.MFA_CODE });
    expect(res.body.next).toBe('select-workspace');
    expect(res.body.session.org).toBeNull();
    expect(res.body.session.workspaces.map((w) => w.name).sort()).toEqual(['Alpha Fund I', 'Alpha Fund II']);
    expect(h.code(await agent.get('/api/v1/portal/team'))).toBe('no_workspace_selected');

    expect((await agent.post('/api/v1/auth/session/workspace').send({ orgId: other.id })).status).toBe(404);
    const picked = await agent.post('/api/v1/auth/session/workspace').send({ orgId: b.id });
    expect(picked.body.session.org.id).toBe(b.id);
    expect(picked.body.session.role).toBe('auditor');
  });

  test('MonkFlow staff can enter any workspace and are labelled as staff', async () => {
    const org = await h.createOrg();
    const staff = await h.createUser({ platformAdmin: true });
    const cookie = await h.cookieFor(staff, null);
    const res = await h.api().post('/api/v1/auth/session/workspace').set('Cookie', cookie).send({ orgId: org.id });
    expect(res.body.session.role).toBe('monkflow_staff');
    const log = await h.db.query("SELECT actor_role FROM audit_log WHERE org_id = $1 AND action = 'auth.workspace_entered'", [org.id]);
    expect(log.rows[0].actor_role).toBe('monkflow_staff');
  });
});

describe('single sign-on', () => {
  const followSso = async (agent, provider, email, query = '') => {
    const start = await agent.get(`/api/v1/auth/sso/${provider}/start${query}`);
    expect(start.status).toBe(302);
    const state = new URL(start.headers.location, 'http://x').searchParams.get('state');
    return agent.get('/api/v1/auth/sso/callback').query({ state, code: `${provider}:${email}` });
  };

  test('a firm that requires Microsoft sign-in cannot be entered with a password', async () => {
    const domain = `${h.uniq('bank')}.test`;
    const org = await h.createOrg({ domains: [domain], ssoProvider: 'microsoft', ssoRequired: true });
    const user = await h.createUser({ email: `analyst@${domain}` });
    await h.addMember(org, user, 'reviewer');

    const discover = await h.api().post('/api/v1/auth/discover').send({ email: `anyone@${domain}` });
    expect(discover.body.ssoRequired).toBe('microsoft');

    const pw = await signIn(h.agent(), user.email);
    expect(pw.status).toBe(403);
    expect(h.code(pw)).toBe('sso_required');

    const viaCode = await h.api().post('/api/v1/auth/email-code').send({ email: user.email });
    expect(h.code(viaCode)).toBe('sso_required');

    const wrongProvider = await followSso(h.agent(), 'google', user.email);
    expect(wrongProvider.headers.location).toMatch(/\/sign-in\?error=sso_required&provider=microsoft/);

    const agent = h.agent();
    const ok = await followSso(agent, 'microsoft', user.email, '?next=/dashboard/review');
    expect(ok.headers.location).toMatch(/\/auth\/callback\?to=dashboard&next=%2Fdashboard%2Freview/);
    const session = await agent.get('/api/v1/auth/session');
    expect(session.body.session.authMethod).toBe('sso:microsoft');
    expect(session.body.session.mfaSetupRequired).toBe(false);
    expect((await agent.get('/api/v1/portal/team')).status).toBe(200);
  });

  test('a forged or replayed callback is refused', async () => {
    const agent = h.agent();
    await agent.get('/api/v1/auth/sso/google/start');
    const res = await agent.get('/api/v1/auth/sso/callback').query({ state: 'not-the-state', code: 'google:someone@example.test' });
    expect(res.headers.location).toMatch(/\/sign-in\?error=sso_failed/);
    const noFlow = await h.api().get('/api/v1/auth/sso/callback').query({ state: 'x', code: 'google:someone@example.test' });
    expect(noFlow.headers.location).toMatch(/error=sso_failed/);
  });

  test('SSO does not create accounts for people who were never invited', async () => {
    const res = await followSso(h.agent(), 'google', 'stranger@example.test');
    expect(res.headers.location).toMatch(/\/sign-in\?error=no_account/);
  });

  test('the redirect after sign-in cannot leave the site', async () => {
    const start = await h.agent().get('/api/v1/auth/sso/google/start?next=//evil.example/x');
    const cookie = start.headers['set-cookie'].join(';');
    const payload = JSON.parse(Buffer.from(cookie.match(/mf_oauth=([^;]+)/)[1].split('.')[1], 'base64url').toString());
    expect(payload.next).toBe('');
  });
});

describe('emailed sign-in code', () => {
  test('answers the same for unknown addresses and signs a real one in', async () => {
    const org = await h.createOrg();
    const { user } = await h.member(org, 'auditor');
    const unknown = await h.api().post('/api/v1/auth/email-code').send({ email: 'nobody@example.test' });
    const known = await h.api().post('/api/v1/auth/email-code').send({ email: user.email });
    expect(unknown.body).toEqual(known.body);

    const agent = h.agent();
    expect(h.code(await agent.post('/api/v1/auth/email-code/verify').send({ email: user.email, code: '000001' }))).toBe('invalid_code');
    const res = await agent.post('/api/v1/auth/email-code/verify').send({ email: user.email, code: stub.EMAIL_CODE });
    expect(res.body.next).toBe('dashboard');
    expect(res.body.session.authMethod).toBe('email_code');
  });
});

describe('session lifetime', () => {
  test('an idle session ends at the workspace limit and is told why', async () => {
    const org = await h.createOrg({ idleMinutes: 15 });
    const { user, cookie } = await h.member(org, 'admin');
    expect((await h.api().get('/api/v1/auth/session').set('Cookie', cookie)).body.session.idleMinutes).toBe(15);
    await h.db.query("UPDATE sessions SET last_seen_at = NOW() - INTERVAL '16 minutes' WHERE user_id = $1", [user.id]);
    const res = await h.api().get('/api/v1/portal/team').set('Cookie', cookie);
    expect(res.status).toBe(401);
    expect(h.code(res)).toBe('not_signed_in');
  });

  test('checking the session does not keep it alive, activity does', async () => {
    const org = await h.createOrg();
    const { user, cookie } = await h.member(org, 'admin');
    const seen = async () => (await h.db.query('SELECT last_seen_at FROM sessions WHERE user_id = $1', [user.id])).rows[0].last_seen_at.getTime();
    await h.db.query("UPDATE sessions SET last_seen_at = NOW() - INTERVAL '10 minutes' WHERE user_id = $1", [user.id]);
    const before = await seen();
    await h.api().get('/api/v1/auth/session').set('Cookie', cookie);
    await h.api().get('/api/v1/portal/team').set('Cookie', cookie).set('X-MF-Background', '1');
    expect(await seen()).toBe(before);
    await h.api().post('/api/v1/auth/session/touch').set('Cookie', cookie).send({});
    expect(await seen()).toBeGreaterThan(before);
  });

  test('a session ends at its absolute limit even when active', async () => {
    const org = await h.createOrg();
    const { user, cookie } = await h.member(org, 'admin');
    await h.db.query("UPDATE sessions SET expires_at = NOW() - INTERVAL '1 minute' WHERE user_id = $1", [user.id]);
    expect((await h.api().get('/api/v1/auth/session').set('Cookie', cookie)).status).toBe(401);
  });

  test('signing out revokes the session on the server', async () => {
    const org = await h.createOrg();
    const { cookie } = await h.member(org, 'admin');
    await h.api().post('/api/v1/auth/sign-out').set('Cookie', cookie).send({});
    expect((await h.api().get('/api/v1/auth/session').set('Cookie', cookie)).status).toBe(401);
  });

  test('a password reset ends every open session', async () => {
    const org = await h.createOrg();
    const { user, cookie } = await h.member(org, 'admin');
    const { hashToken } = require('../src/utils/crypto');
    await h.db.query("UPDATE users SET password_reset_token = $2, password_reset_expires = NOW() + INTERVAL '1 hour' WHERE id = $1", [user.id, hashToken('reset-token-value')]);
    const short = await h.api().post('/api/v1/auth/reset-password').send({ token: 'reset-token-value', newPassword: 'short' });
    expect(short.status).toBe(400);
    const res = await h.api().post('/api/v1/auth/reset-password').send({ token: 'reset-token-value', newPassword: 'a brand new passphrase' });
    expect(res.status).toBe(200);
    expect((await h.api().get('/api/v1/auth/session').set('Cookie', cookie)).status).toBe(401);
  });
});

describe('cross-site requests', () => {
  test('a write that names a foreign origin is refused', async () => {
    const org = await h.createOrg();
    const { cookie } = await h.member(org, 'admin');
    const res = await h.api().post('/api/v1/portal/invitations').set('Cookie', cookie).set('Origin', 'https://evil.example').send({ email: 'x@example.test', role: 'auditor' });
    expect(res.status).toBe(403);
    expect(h.code(res)).toBe('bad_origin');
    const ok = await h.api().post('/api/v1/portal/invitations').set('Cookie', cookie).set('Origin', 'http://localhost:4173').send({ email: 'x@example.test', role: 'auditor' });
    expect(ok.status).toBe(201);
  });
});
