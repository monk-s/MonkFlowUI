/** Phase 4: Requests, Vault and Integrations. */
const h = require('./helpers');

let org, admin, reviewer, auditor, other, staffCookie;
const as = (who) => ({
  get: (p) => h.api().get(`/api/v1/portal${p}`).set('Cookie', who.cookie),
  post: (p, b) => h.api().post(`/api/v1/portal${p}`).set('Cookie', who.cookie).send(b || {}),
});
const staff = (method, p, b) => h.api()[method](`/api/v1/admin/organizations/${org.id}${p}`).set('Cookie', staffCookie).send(b || {});
const actions = async () => (await h.db.query('SELECT action FROM audit_log WHERE org_id = $1 ORDER BY id', [org.id])).rows.map((r) => r.action);

beforeAll(async () => {
  org = await h.createOrg();
  admin = await h.member(org, 'admin', { firstName: 'Dana', lastName: 'Okafor' });
  reviewer = await h.member(org, 'reviewer');
  auditor = await h.member(org, 'auditor');
  other = await h.member(await h.createOrg(), 'admin');
  staffCookie = await h.cookieFor(await h.createUser({ platformAdmin: true }), null);
});
afterAll(h.close);

describe('requests', () => {
  let id;
  test('an admin or reviewer asks; an auditor reads but cannot ask', async () => {
    expect((await as(auditor).post('/requests', { title: 'Add a field' })).status).toBe(404);
    expect((await as(admin).post('/requests', { title: ' ' })).status).toBe(400);
    const made = await as(admin).post('/requests', { title: 'Add loan number to the export', detail: 'Our LOS needs it in column A.' });
    expect(made.status).toBe(201);
    id = made.body.request.id;
    const seen = (await as(auditor).get('/requests')).body;
    expect(seen.sent).toMatchObject([{ id, title: 'Add loan number to the export', status: 'open', requestedByName: 'Dana Okafor' }]);
    expect(seen.canCreate).toBe(false);
  });

  test('it stays out of "Waiting on you", cannot be marked done by the client, and other workspaces never see it', async () => {
    await staff('post', '/actions', { kind: 'documents', title: 'Send three sample rent rolls' });
    expect((await as(admin).get('/actions')).body.actions.map((a) => a.title)).toEqual(['Send three sample rent rolls']);
    expect((await as(admin).post(`/actions/${id}/complete`)).status).toBe(404);
    const theirs = (await as(admin).get('/requests')).body;
    expect(theirs.received.map((r) => r.title)).toEqual(['Send three sample rent rolls']);
    expect((await as(other).get('/requests')).body).toMatchObject({ sent: [], received: [] });
    expect((await as(other).post(`/requests/${id}/withdraw`)).status).toBe(404);
  });

  test('MonkFlow closes it with a reply; a second request can be withdrawn; all of it is logged', async () => {
    expect((await staff('post', `/actions/${id}/close`, { reply: '' })).status).toBe(400);
    expect((await staff('post', `/actions/${id}/close`, { reply: 'Done. It is column A from tonight.' })).status).toBe(200);
    expect((await staff('delete', `/actions/${id}`)).status).toBe(404);   // staff withdraw is for their own requests
    const second = (await as(reviewer).post('/requests', { title: 'Never mind this one' })).body.request.id;
    expect((await as(reviewer).post(`/requests/${second}/withdraw`)).status).toBe(200);
    expect((await as(reviewer).post(`/requests/${second}/withdraw`)).status).toBe(404);
    const sent = (await as(admin).get('/requests')).body.sent;
    expect(sent.find((r) => r.id === id)).toMatchObject({ status: 'done', reply: 'Done. It is column A from tonight.', closedByName: 'MonkFlow' });
    expect(sent.find((r) => r.id === second).status).toBe('withdrawn');
    expect((await actions()).filter((a) => a.startsWith('request.'))).toEqual(['request.created', 'request.closed', 'request.created', 'request.withdrawn']);
  });
});

test('the vault lists stored documents for this workspace only, and says when one has been deleted', async () => {
  const add = (orgId, name, content) => h.db.query(
    "INSERT INTO documents (org_id, filename, byte_size, sha256, content, purge_after, purged_at) VALUES ($1, $2, 1200, $3, $4, NOW() + INTERVAL '30 days', $5)",
    [orgId, name, 'a'.repeat(64), content, content ? null : new Date()]
  );
  await add(org.id, 'rent-roll.pdf', Buffer.from('x'));
  await add(org.id, 'old-t12.pdf', null);
  await add(other.membership.org_id, 'theirs.pdf', Buffer.from('x'));
  const docs = (await as(auditor).get('/vault')).body.documents;
  expect(docs.map((d) => [d.filename, d.available]).sort()).toEqual([['old-t12.pdf', false], ['rent-roll.pdf', true]]);
  expect(JSON.stringify(docs)).not.toContain('content');
});

test('integration status is set by staff, read by the workspace, and never writable by it', async () => {
  expect((await staff('post', '/connections', { system: 'Yardi', status: 'working' })).status).toBe(400);
  const made = await staff('post', '/connections', { system: 'Yardi', status: 'healthy', note: 'Nightly export', synced: true });
  expect(made.status).toBe(201);
  const cid = made.body.connection.id;
  expect((await staff('patch', `/connections/${cid}`, { system: 'Yardi', status: 'attention', note: 'Export arrived late' })).status).toBe(200);

  const seen = (await as(auditor).get('/connections')).body.connections;
  expect(seen).toMatchObject([{ system: 'Yardi', status: 'attention', note: 'Export arrived late' }]);
  expect(seen[0].lastSyncAt).toBeTruthy();
  expect((await as(other).get('/connections')).body.connections).toEqual([]);
  expect((await as(admin).post('/connections', { system: 'x', status: 'healthy' })).status).toBe(404);

  // The staff detail page carries it too, and removal is logged.
  expect((await staff('get', '/engagement')).body.connections).toHaveLength(1);
  expect((await staff('delete', `/connections/${cid}`)).status).toBe(200);
  expect((await actions()).filter((a) => a.startsWith('connection.'))).toEqual(['connection.status_set', 'connection.status_set', 'connection.removed']);
});
