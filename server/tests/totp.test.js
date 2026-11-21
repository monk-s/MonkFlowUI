const h = require('./helpers');
const local = require('../src/services/identity/local');

afterAll(h.close);

test('codes match the RFC 6238 test vector', () => {
  // SHA-1 vector: secret "12345678901234567890", time 59s -> 94287082 (last 6 digits).
  expect(local.totp(Buffer.from('12345678901234567890'), 1)).toBe('287082');
});

test('set up, sign in with a code, and a code cannot be used twice', async () => {
  const user = await h.createUser();
  const now = Date.now();
  const { secret } = await local.enrollTotp({ email: user.email });
  expect(secret).toMatch(/^[A-Z2-7]{32}$/);
  const key = async (col) => require('../src/utils/secretBox').open((await h.db.query(`SELECT ${col} FROM users WHERE id = $1`, [user.id])).rows[0][col], user.id);
  const codeAt = async (col, ms) => local.totp(await key(col), Math.floor(ms / 30000));

  // Not asked for a code until setup is confirmed.
  expect((await local.verifyPassword({ email: user.email, password: h.PASSWORD })).mfa).toBeUndefined();
  expect((await local.confirmTotp({ email: user.email, code: '000000' }, now)).ok).toBe(false);
  expect((await local.confirmTotp({ email: user.email, code: await codeAt('mfa_pending_secret', now) }, now)).ok).toBe(true);

  const signIn = await local.verifyPassword({ email: user.email, password: h.PASSWORD });
  expect(signIn.mfa.pendingToken).toBe(user.email);
  const later = now + 60000;
  const code = await codeAt('mfa_secret', later);
  expect((await local.verifyMfa({ pendingToken: user.email, code: '123456' }, later)).ok).toBe(false);
  expect((await local.verifyMfa({ pendingToken: user.email, code }, later)).ok).toBe(true);
  expect((await local.verifyMfa({ pendingToken: user.email, code }, later)).ok).toBe(false);   // replay
});

test('the staff console refuses a password sign-in that skipped the second step', async () => {
  const staff = await h.createUser({ platformAdmin: true });
  const cookie = await h.cookieFor(staff, null, { mfaVerified: false });
  expect((await h.api().get('/api/v1/users/me').set('Cookie', cookie)).status).toBe(403);
  expect((await h.api().post('/api/v1/auth/login').send({ email: staff.email, password: h.PASSWORD })).status).toBe(404);
});
