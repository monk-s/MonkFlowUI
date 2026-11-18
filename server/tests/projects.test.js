const h = require('./helpers');

afterAll(h.close);

test('only MonkFlow staff can post updates or upload files to a project', async () => {
  const client = await h.member(await h.createOrg(), 'admin');
  const base = '/api/v1/projects/00000000-0000-4000-8000-000000000000';
  const results = await Promise.all([
    h.api().post(`${base}/updates`).set('Cookie', client.cookie).send({ message: 'hello' }),
    h.api().post(`${base}/files`).set('Cookie', client.cookie).send({ filename: 'a.txt', data: 'aGk=' }),
  ]);
  // The message tells this refusal apart from the cross-site (CSRF) 403.
  expect(results.map((r) => [r.status, r.body.error.message])).toEqual([
    [403, 'Superadmin access required'],
    [403, 'Superadmin access required'],
  ]);
});
