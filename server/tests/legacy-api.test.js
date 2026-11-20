const h = require('./helpers');

afterAll(h.close);

// One read per pre-portal route group that app.js mounts behind staffOnly.
const GROUPS = [
  '/users/me', '/workflows', '/agents', '/notifications', '/logs', '/settings/notifications',
  '/api-keys', '/team/members', '/dashboard/stats', '/plans', '/integrations',
];

test('a client sign-in is refused by every pre-portal route group', async () => {
  const client = await h.member(await h.createOrg(), 'admin');
  const results = await Promise.all(GROUPS.map((p) => h.api().get(`/api/v1${p}`).set('Cookie', client.cookie)));
  expect(results.map((r, i) => [GROUPS[i], r.status])).toEqual(GROUPS.map((p) => [p, 403]));
});

test('MonkFlow staff still reach them, and nobody does without signing in', async () => {
  const staff = await h.createUser({ platformAdmin: true, mfaEnrolled: true });
  const cookie = await h.cookieFor(staff, null);
  expect((await h.api().get('/api/v1/users/me').set('Cookie', cookie)).status).toBe(200);
  expect((await h.api().get('/api/v1/api-keys').set('Cookie', cookie)).status).toBe(200);
  expect((await h.api().get('/api/v1/api-keys')).status).toBe(401);
});

test('integration credentials are sealed at rest and read back intact', async () => {
  const model = require('../src/models/integration.model');
  const user = await h.createUser();
  const before = process.env.DOCUMENT_KEY;
  process.env.DOCUMENT_KEY = 'ab'.repeat(32);
  try {
    const saved = await model.upsert(user.id, 'twilio', { accountSid: 'AC123', authToken: 'secret-token' });
    expect(saved.config).toEqual({ accountSid: 'AC123', authToken: 'secret-token' });
    const raw = (await h.db.query('SELECT config FROM user_integrations WHERE user_id = $1', [user.id])).rows[0].config;
    expect(Object.keys(raw)).toEqual(['_sealed']);
    expect(JSON.stringify(raw)).not.toContain('secret-token');
    expect((await model.findByUserAndProvider(user.id, 'twilio')).config.authToken).toBe('secret-token');
  } finally { if (before === undefined) delete process.env.DOCUMENT_KEY; else process.env.DOCUMENT_KEY = before; }
});
