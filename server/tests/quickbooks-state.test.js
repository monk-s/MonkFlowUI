const h = require('./helpers');
const { signState, userIdFromState } = require('../src/controllers/quickbooks.controller');

afterAll(h.close);

test('the QuickBooks connect state only binds an account this server signed, for 30 minutes', () => {
  const now = Date.now();
  const state = signState('user-1', now);
  expect(userIdFromState(state, now + 60_000)).toBe('user-1'); // works again on a second pass
  expect(userIdFromState(state, now + 31 * 60_000)).toBeNull(); // expired
  expect(userIdFromState('user-1')).toBeNull(); // the old bare-id state
  expect(userIdFromState(state.replace('user-1', 'user-2'), now)).toBeNull(); // re-pointed
  expect(userIdFromState(['a', 'b'], now)).toBeNull();
});

test('the QuickBooks callback refuses a state naming a user id', async () => {
  const res = await h.api().get('/api/v1/quickbooks/callback?code=c&realmId=r&state=00000000-0000-4000-8000-000000000000');
  expect(res.status).toBe(400);
});
