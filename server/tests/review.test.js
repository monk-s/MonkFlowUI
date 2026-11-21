/**
 * Phase 3: a pipeline posts an extracted document; the client corrects it,
 * approves or rejects it and exports it. Every step is in the audit log.
 */
const h = require('./helpers');
const { num, runChecks } = require('../src/portal/review');
const { purgeExpiredDocuments } = require('../src/routes/ingest.routes');

let org, other, admin, reviewer, auditor, outsider, staffCookie, key, otherKey;

const as = (who) => ({
  get: (p) => h.api().get(`/api/v1/portal${p}`).set('Cookie', who.cookie),
  post: (p, b) => h.api().post(`/api/v1/portal${p}`).set('Cookie', who.cookie).send(b || {}),
  patch: (p, b) => h.api().patch(`/api/v1/portal${p}`).set('Cookie', who.cookie).send(b || {}),
});
const ingest = (body, k = key) => h.api().post('/api/v1/ingest/review-items').set('Authorization', `Bearer ${k}`).send(body);
const makeKey = async (orgId) => (await h.api().post(`/api/v1/admin/organizations/${orgId}/ingest-keys`).set('Cookie', staffCookie).send({ name: 'Rent roll pipeline' })).body;
const actions = async (orgId = org.id) => (await h.db.query('SELECT action, actor_role, metadata FROM audit_log WHERE org_id = $1 ORDER BY id', [orgId])).rows;

const PDF = Buffer.from('%PDF-1.4\nEXAMPLE_DATA synthetic rent roll\n%%EOF');
// EXAMPLE_DATA. Three units; the middle rent was misread ("1,5O0" with a letter O).
const rentRoll = (over = {}) => ({
  template: 'rent_roll', title: 'Rent roll, Maple Court, Oct 2026', subject: 'Maple Court Apartments', period: 'Oct 2026',
  document: { filename: 'maple court.pdf', contentBase64: PDF.toString('base64') },
  fields: [
    { group: 'property', key: 'total_units', label: 'Units', value: 3, confidence: 0.99, page: 1 },
    { group: 'property', key: 'occupied_units', label: 'Occupied units', value: '2', confidence: 0.99, page: 1 },
    { group: 'property', key: 'occupancy', label: 'Occupancy', value: '66.7%', confidence: 0.97, page: 1 },
    { group: 'units', row: 0, key: 'rent', label: 'Rent', value: '$1,450.00', confidence: 0.98, page: 2 },
    { group: 'units', row: 1, key: 'rent', label: 'Rent', value: '$1,5O0.00', confidence: 0.62, page: 2 },
    { group: 'units', row: 2, key: 'rent', label: 'Rent', value: '$0.00', confidence: 0.96, page: 2 },
    { group: 'totals', key: 'monthly_rent', label: 'Monthly rent', value: '$2,950.00', confidence: 0.99, page: 2 },
  ],
  ...over,
});

beforeAll(async () => {
  org = await h.createOrg({ name: 'Harbor Ridge Capital' });
  other = await h.createOrg({ name: 'Cedar Point Partners' });
  admin = await h.member(org, 'admin', { firstName: 'Dana', lastName: 'Okafor' });
  reviewer = await h.member(org, 'reviewer', { firstName: 'Marcus', lastName: 'Lee' });
  auditor = await h.member(org, 'auditor');
  outsider = await h.member(other, 'admin');
  staffCookie = await h.cookieFor(await h.createUser({ platformAdmin: true }), null);
  key = (await makeKey(org.id)).key;
  otherKey = (await makeKey(other.id)).key;
});
afterAll(h.close);

test('numbers are read the way documents write them', () => {
  expect(['$1,450.00', '(250)', '-12.5', '93.8%', '48'].map(num)).toEqual([1450, -250, -12.5, 93.8, 48]);
  expect(['1,5O0', '', 'n/a', null].map(num).every(Number.isNaN)).toBe(true);
});

test("the demo's copy of the templates matches the server's", () => {
  const read = (p) => require('fs').readFileSync(require('path').join(__dirname, p), 'utf8');
  expect(read('../../portal/src/demo/templates.json')).toBe(read('../src/portal/templates.json'));
});

test('bank and fund documents are checked: a financial statement and a subscription agreement', () => {
  const line = (group, row, value) => ({ group, row, key: 'amount', label: 'Amount', value });
  const total = (key, value) => ({ group: 'totals', row: null, key, label: key, value });
  const pfs = [line('assets', 0, '$250,000'), line('assets', 1, '$50,000'), line('liabilities', 0, '$120,000'),
    total('total_assets', '$300,000'), total('total_liabilities', '$120,000'), total('net_worth', '$190,000')];
  expect(Object.fromEntries(runChecks('financial_statement', pfs).map((c) => [c.id, c.status])))
    .toEqual({ assets: 'pass', liabilities: 'pass', net_worth: 'fail' });
  const sub = [line('commitments', 0, '500,000'), line('commitments', 1, '250,000'), total('total_commitment', '750,000')];
  expect(runChecks('subscription', sub).map((c) => c.status)).toEqual(['pass']);
});

test('a T-12 is checked line by line and down to NOI', () => {
  const months = (group, row, each, annual) => [
    ...Array.from({ length: 12 }, (_, i) => ({ group, row, key: `m${i + 1}`, label: `Month ${i + 1}`, value: String(each) })),
    { group, row, key: 'annual', label: 'Annual', value: String(annual) },
  ];
  const fields = [
    ...months('income', 0, 1000, 12000), ...months('expenses', 0, 400, 4800), ...months('expenses', 1, 100, 1300),
    { group: 'totals', row: null, key: 'total_income', label: 'Total income', value: '12,000' },
    { group: 'totals', row: null, key: 'total_expenses', label: 'Total expenses', value: '6,100' },
    { group: 'totals', row: null, key: 'noi', label: 'NOI', value: '5,900' },
  ];
  const by = Object.fromEntries(runChecks('t12', fields).map((c) => [c.id, c.status]));
  expect(by).toEqual({ income_months: 'pass', expense_months: 'fail', income_total: 'pass', expense_total: 'pass', noi: 'pass' });
  expect(runChecks('t12', fields).find((c) => c.id === 'expense_months').detail).toBe('1 of 2 rows do not add up: row 2.');
});

describe('ingest', () => {
  test('the key is shown once, stored hashed, and decides the workspace', async () => {
    expect(key).toMatch(/^mfi_[0-9a-f]{8}_[0-9a-f]{64}$/);
    const stored = (await h.db.query('SELECT key_hash, key_prefix FROM ingest_keys WHERE org_id = $1', [org.id])).rows[0];
    expect(key.startsWith(stored.key_prefix)).toBe(true);
    expect(JSON.stringify(stored)).not.toContain(key.slice(13));
    const shown = (await h.api().get(`/api/v1/admin/organizations/${org.id}/engagement`).set('Cookie', staffCookie)).body.ingestKeys;
    expect(shown).toEqual([expect.objectContaining({ name: 'Rent roll pipeline', prefix: stored.key_prefix })]);
    expect(JSON.stringify(shown)).not.toContain(key.slice(13));

    for (const bad of ['', 'Bearer nope', `Bearer ${key}0`]) {
      expect((await h.api().post('/api/v1/ingest/review-items').set('Authorization', bad).send(rentRoll())).status).toBe(401);
    }
    // A client's own login is not a pipeline key.
    expect((await h.api().post('/api/v1/ingest/review-items').set('Cookie', admin.cookie).send(rentRoll())).status).toBe(401);
  });

  test('bad input is refused with a reason and stores nothing', async () => {
    expect(h.code(await ingest(rentRoll({ template: 'tax_return' })))).toBe('invalid_input');
    expect(h.code(await ingest(rentRoll({ fields: [] })))).toBe('invalid_input');
    expect(h.code(await ingest(rentRoll({ fields: [{ group: 'tenants', key: 'x', label: 'X', value: '1' }] })))).toBe('invalid_input');
    expect(h.code(await ingest(rentRoll({ document: { filename: 'x.exe', contentBase64: Buffer.from('MZ not a pdf').toString('base64') } })))).toBe('invalid_input');
    const theirs = await h.createWorkflow(other, admin.user);
    expect(h.code(await ingest(rentRoll({ workflowId: theirs.id })))).toBe('invalid_input');
    const mine = [[org.id, other.id]];
    expect((await h.db.query('SELECT count(*)::int AS n FROM review_items WHERE org_id = ANY($1)', mine)).rows[0].n).toBe(0);
    expect((await h.db.query('SELECT count(*)::int AS n FROM documents WHERE org_id = ANY($1)', mine)).rows[0].n).toBe(0);
  });

  test('a document arrives once, encrypted, and is logged as the pipeline', async () => {
    const first = await ingest(rentRoll({ externalRef: 'run-1/doc-1' }));
    expect(first.status).toBe(201);
    const again = await ingest(rentRoll({ externalRef: 'run-1/doc-1' }));
    expect(again.status).toBe(200);
    expect(again.body).toEqual({ id: first.body.id, duplicate: true });

    const doc = (await h.db.query('SELECT content, byte_size, purge_after > NOW() + INTERVAL \'29 days\' AS kept FROM documents WHERE org_id = $1', [org.id])).rows;
    expect(doc).toHaveLength(1);
    expect(doc[0].content.includes(Buffer.from('synthetic rent roll'))).toBe(false);
    expect(doc[0]).toMatchObject({ byte_size: PDF.length, kept: true });
    expect((await actions()).pop()).toMatchObject({ action: 'review.received', actor_role: 'monkflow_pipeline', metadata: { fields: 7, document: true } });

    const noKey = process.env.DOCUMENT_KEY;
    delete process.env.DOCUMENT_KEY;
    expect(h.code(await ingest(rentRoll()))).toBe('storage_not_configured');
    process.env.DOCUMENT_KEY = noKey;
  });
});

describe('review', () => {
  let id;
  const rentField = () => 'f4';

  test('the queue shows what needs a person', async () => {
    const res = await as(auditor).get('/review?status=queued');
    expect(res.status).toBe(200);
    expect(res.body.counts).toEqual({ queued: 1, approved: 0, rejected: 0 });
    expect(res.body.items).toEqual([expect.objectContaining({
      title: 'Rent roll, Maple Court, Oct 2026', templateLabel: 'Rent roll', subject: 'Maple Court Apartments', status: 'queued',
      fieldCount: 7, flagged: 1, lowestConfidence: 0.62, checksPassed: 1, checksTotal: 2, blocked: true,
    })]);
    id = res.body.items[0].id;
    expect((await as(auditor).get('/review?status=approved')).body.items).toEqual([]);
  });

  test('the item carries fields, checks, and who may decide', async () => {
    const item = (await as(reviewer).get(`/review/${id}`)).body.item;
    expect(item.groups.map((g) => g.label)).toEqual(['Property', 'Units', 'Totals']);
    expect(item.fields[4]).toMatchObject({ id: 'f4', group: 'units', row: 1, value: '$1,5O0.00', original: null, confidence: 0.62, page: 2 });
    expect(item.checks).toEqual([
      expect.objectContaining({ id: 'rent_sum', status: 'fail', blocking: true, detail: '"Rent" in row 2 cannot be read as a number.' }),
      expect.objectContaining({ id: 'occupancy', status: 'pass' }),
    ]);
    expect(item).toMatchObject({ document: 'available', documentName: 'maple court.pdf', canDecide: true });
    expect(item.trail.map((t) => [t.action, t.actor])).toEqual([['review.received', 'MonkFlow']]);
    expect((await as(auditor).get(`/review/${id}`)).body.item.canDecide).toBe(false);
  });

  test('the source document is served decrypted to the workspace, and the view is logged', async () => {
    const res = await as(auditor).get(`/review/${id}/document`).buffer(true).parse((r, cb) => { const c = []; r.on('data', (d) => c.push(d)); r.on('end', () => cb(null, Buffer.concat(c))); });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.body.equals(PDF)).toBe(true);
    expect((await actions()).pop()).toMatchObject({ action: 'review.document_viewed', actor_role: 'auditor' });
  });

  test('another workspace sees none of it', async () => {
    expect((await as(outsider).get('/review')).body).toEqual({ items: [], counts: { queued: 0, approved: 0, rejected: 0 } });
    for (const path of [`/review/${id}`, `/review/${id}/document`, `/review/${id}/export`]) expect((await as(outsider).get(path)).status).toBe(404);
    expect((await as(outsider).post(`/review/${id}/approve`, { reason: 'long enough reason' })).status).toBe(404);
    expect((await as(outsider).patch(`/review/${id}/fields`, { edits: [{ id: 'f4', value: '1' }] })).status).toBe(404);
    // The other workspace's key files into the other workspace.
    const theirs = await ingest(rentRoll({ document: null }), otherKey);
    expect((await as(admin).get(`/review/${theirs.body.id}`)).status).toBe(404);
    expect((await as(outsider).get(`/review/${theirs.body.id}`)).body.item.document).toBe('none');
  });

  test('an auditor cannot edit or decide', async () => {
    expect((await as(auditor).patch(`/review/${id}/fields`, { edits: [{ id: 'f4', value: '1' }] })).status).toBe(404);
    expect((await as(auditor).post(`/review/${id}/approve`)).status).toBe(404);
    expect((await as(auditor).post(`/review/${id}/reject`, { reason: 'no' })).status).toBe(404);
  });

  test('a failing blocking check stops approval until it is fixed or overridden in writing', async () => {
    const res = await as(reviewer).post(`/review/${id}/approve`);
    expect(res.status).toBe(409);
    expect(h.code(res)).toBe('checks_failing');
    expect(h.code(await as(reviewer).post(`/review/${id}/approve`, { reason: 'ok' }))).toBe('checks_failing');
  });

  test('an edit keeps the original, re-runs the checks, and logs the field but not its value', async () => {
    expect(h.code(await as(reviewer).patch(`/review/${id}/fields`, { edits: [{ id: 'f99', value: '1' }] }))).toBe('invalid_input');
    const res = await as(reviewer).patch(`/review/${id}/fields`, { edits: [{ id: rentField(), value: ' $1,500.00 ' }, { id: 'f0', value: '3' }] });
    expect(res.status).toBe(200);
    expect(res.body.item.fields[4]).toMatchObject({ value: '$1,500.00', original: '$1,5O0.00', editedByName: 'Marcus Lee' });
    expect(res.body.item.fields[0]).toMatchObject({ value: '3', original: null });   // unchanged, so not an edit
    expect(res.body.item.checks[0]).toMatchObject({ id: 'rent_sum', status: 'pass' });
    expect(res.body.item).toMatchObject({ flagged: 0, blocked: false });

    const last = (await actions()).pop();
    expect(last).toMatchObject({ action: 'review.fields_edited', actor_role: 'reviewer', metadata: { fields: ['Rent, row 2'], count: 1 } });
    expect(JSON.stringify(last.metadata)).not.toContain('1,500');
  });

  test('approval records who and when, and closes the item to further change', async () => {
    const res = await as(reviewer).post(`/review/${id}/approve`);
    expect(res.status).toBe(200);
    expect(res.body.item).toMatchObject({ status: 'approved', decidedByName: 'Marcus Lee', canDecide: false, decisionReason: null });
    expect(res.body.item.trail.map((t) => t.action)).toEqual(['review.received', 'review.fields_edited', 'review.approved']);
    expect(h.code(await as(admin).post(`/review/${id}/reject`, { reason: 'changed my mind' }))).toBe('already_decided');
    expect(h.code(await as(admin).patch(`/review/${id}/fields`, { edits: [{ id: 'f4', value: '9' }] }))).toBe('already_decided');
    expect((await as(admin).get('/review')).body.counts).toEqual({ queued: 0, approved: 1, rejected: 0 });
  });

  test('an override and a rejection both need, and record, a reason', async () => {
    const a = (await ingest(rentRoll({ document: null }))).body.id;
    const over = await as(admin).post(`/review/${a}/approve`, { reason: 'Unit 2 rent confirmed by phone with the manager' });
    expect(over.body.item).toMatchObject({ status: 'approved', decisionReason: 'Unit 2 rent confirmed by phone with the manager' });
    expect((await actions()).pop().metadata).toMatchObject({ overrode: ['Unit rents add up to the stated monthly total'], reason: 'Unit 2 rent confirmed by phone with the manager' });

    const b = (await ingest(rentRoll({ document: null }))).body.id;
    expect(h.code(await as(admin).post(`/review/${b}/reject`))).toBe('reason_required');
    const rejected = await as(admin).post(`/review/${b}/reject`, { reason: 'Wrong property' });
    expect(rejected.body.item).toMatchObject({ status: 'rejected', decisionReason: 'Wrong property' });
    expect((await actions()).pop()).toMatchObject({ action: 'review.rejected', metadata: { reason: 'Wrong property' } });
  });

  test('exports carry the edit trail and are themselves logged', async () => {
    const csv = await as(auditor).get(`/review/${id}/export`);
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.headers['content-disposition']).toContain('attachment');
    const lines = csv.text.trim().split('\r\n');
    expect(lines[0]).toBe('Section,Row,Field,Value,Extracted value,Confidence,Page,Edited by,Edited at');
    expect(lines[5]).toMatch(/^Units,2,Rent,"\$1,500\.00","\$1,5O0\.00",0\.62,2,Marcus Lee,20/);
    expect((await actions()).pop()).toMatchObject({ action: 'review.exported', actor_role: 'auditor', metadata: { format: 'csv' } });

    const json = await as(admin).get(`/review/${id}/export?format=json`);
    expect(JSON.parse(json.text)).toMatchObject({ status: 'approved', fields: expect.any(Array), checks: expect.any(Array) });
  });

  test('at its retention date the file is deleted; the reviewed fields remain', async () => {
    expect(await purgeExpiredDocuments()).toBe(0);
    await h.db.query("UPDATE documents SET purge_after = NOW() - INTERVAL '1 minute' WHERE org_id = $1", [org.id]);
    expect(await purgeExpiredDocuments()).toBe(1);
    expect((await h.db.query('SELECT content, purged_at IS NOT NULL AS purged FROM documents WHERE org_id = $1', [org.id])).rows[0]).toEqual({ content: null, purged: true });
    expect((await as(admin).get(`/review/${id}/document`)).status).toBe(404);
    const item = (await as(admin).get(`/review/${id}`)).body.item;
    expect(item.document).toBe('purged');
    expect(item.fields).toHaveLength(7);
  });

  test('a revoked key stops working', async () => {
    const keyId = (await h.db.query('SELECT id FROM ingest_keys WHERE org_id = $1', [org.id])).rows[0].id;
    expect((await h.api().delete(`/api/v1/admin/organizations/${other.id}/ingest-keys/${keyId}`).set('Cookie', staffCookie)).status).toBe(404);
    expect((await h.api().delete(`/api/v1/admin/organizations/${org.id}/ingest-keys/${keyId}`).set('Cookie', staffCookie)).status).toBe(200);
    expect((await ingest(rentRoll())).status).toBe(401);
  });
});

test('the portal role can edit and decide, and nothing more', async () => {
  const { withOrg } = require('../src/portal/withOrg');
  const denied = [
    'SELECT * FROM ingest_keys',
    'DELETE FROM review_items',
    "UPDATE review_items SET title = 'Rewritten'",
    "UPDATE documents SET purge_after = NOW() + INTERVAL '10 years'",
    `INSERT INTO review_items (org_id, template, title, fields) VALUES ('${org.id}', 'rent_roll', 'Self-made', '[]')`,
  ];
  for (const sql of denied) await expect(withOrg(org.id, (db) => db.query(sql))).rejects.toThrow(/permission denied/);
  const seen = await withOrg(other.id, async (db) => ({
    items: (await db.query('SELECT count(*)::int AS n FROM review_items WHERE org_id = $1', [org.id])).rows[0].n,
    docs: (await db.query('SELECT count(*)::int AS n FROM documents WHERE org_id = $1', [org.id])).rows[0].n,
    touched: (await db.query("UPDATE review_items SET status = 'approved' WHERE org_id = $1", [org.id])).rowCount,
  }));
  expect(seen).toEqual({ items: 0, docs: 0, touched: 0 });
});
