/**
 * Phase 2: the engagement tracker, the action queue, workflows and telemetry.
 *
 * Staff build the tracker; clients read it, sign off and mark requests done.
 * Telemetry is counted from run rows and is absent, not zero, when there is
 * nothing to count.
 */
const h = require('./helpers');

let org, admin, reviewer, auditor, staff, staffCookie;

const as = (who) => ({
  get: (p) => h.api().get(`/api/v1/portal${p}`).set('Cookie', who.cookie),
  post: (p, b) => h.api().post(`/api/v1/portal${p}`).set('Cookie', who.cookie).send(b || {}),
});
const adminApi = (orgId = org.id) => {
  const base = `/api/v1/admin/organizations/${orgId}`;
  return {
    get: (p) => h.api().get(base + p).set('Cookie', staffCookie),
    post: (p, b) => h.api().post(base + p).set('Cookie', staffCookie).send(b || {}),
    patch: (p, b) => h.api().patch(base + p).set('Cookie', staffCookie).send(b || {}),
    del: (p) => h.api().delete(base + p).set('Cookie', staffCookie),
  };
};
const auditActions = async (orgId = org.id) => (await h.db.query('SELECT action, actor_role, metadata FROM audit_log WHERE org_id = $1 ORDER BY id', [orgId])).rows;

beforeAll(async () => {
  org = await h.createOrg({ name: 'Harbor Ridge Capital' });
  admin = await h.member(org, 'admin', { firstName: 'Dana', lastName: 'Okafor' });
  reviewer = await h.member(org, 'reviewer');
  auditor = await h.member(org, 'auditor');
  staff = await h.createUser({ platformAdmin: true });
  staffCookie = await h.cookieFor(staff, null);
});
afterAll(h.close);

describe('engagement tracker', () => {
  let engagementId, readyId, plannedId;

  test('staff build it; every step lands in the client\'s audit log as MonkFlow', async () => {
    const created = await adminApi().post('/engagements', { name: 'Rent roll and T-12 intake', stage: 'discovery', nextDeliverable: 'Audit report', nextDeliverableDue: '2026-12-01' });
    expect(created.status).toBe(201);
    engagementId = created.body.engagement.id;

    const m1 = await adminApi().post(`/engagements/${engagementId}/milestones`, { stage: 'discovery', title: 'Audit report delivered', dueOn: '2026-12-01' });
    const m2 = await adminApi().post(`/engagements/${engagementId}/milestones`, { stage: 'architecture', title: 'Sandbox walkthrough' });
    expect([m1.status, m2.status]).toEqual([201, 201]);
    readyId = m1.body.milestone.id;
    plannedId = m2.body.milestone.id;

    expect((await adminApi().patch(`/milestones/${readyId}`, { status: 'awaiting_signoff' })).status).toBe(200);
    expect((await adminApi().patch(`/engagements/${engagementId}`, { stage: 'architecture' })).status).toBe(200);
    expect((await adminApi().post('/engagements', { name: 'x' })).status).toBe(400);
    expect((await adminApi().post(`/engagements/${engagementId}/milestones`, { stage: 'launch', title: 'Bad stage' })).status).toBe(400);

    const log = await auditActions();
    expect(log.map((r) => r.action)).toEqual([
      'engagement.created', 'engagement.milestone_added', 'engagement.milestone_added', 'engagement.milestone_ready', 'engagement.stage_changed',
    ]);
    expect(log.every((r) => r.actor_role === 'monkflow_staff')).toBe(true);
  });

  test('everyone in the workspace reads the same tracker', async () => {
    for (const who of [admin, reviewer, auditor]) {
      const res = await as(who).get('/engagements');
      expect(res.status).toBe(200);
      expect(res.body.engagements).toHaveLength(1);
      expect(res.body.engagements[0]).toMatchObject({
        name: 'Rent roll and T-12 intake', stage: 'architecture', stageLabel: 'Architecture and sandbox',
        nextDeliverable: 'Audit report', nextDeliverableDue: '2026-12-01',
      });
      expect(res.body.engagements[0].milestones.map((m) => [m.title, m.status, m.dueOn])).toEqual([
        ['Audit report delivered', 'awaiting_signoff', '2026-12-01'],
        ['Sandbox walkthrough', 'planned', null],
      ]);
    }
  });

  test('the sign-off is in the action queue, and only an admin can act on it', async () => {
    const forAdmin = (await as(admin).get('/actions')).body.actions;
    expect(forAdmin).toEqual([expect.objectContaining({ id: readyId, kind: 'signoff', title: 'Audit report delivered', canAct: true })]);
    expect((await as(reviewer).get('/actions')).body.actions[0].canAct).toBe(false);

    // 404, not 403: the same answer as for something that does not exist.
    expect((await as(reviewer).post(`/milestones/${readyId}/sign-off`)).status).toBe(404);
    expect((await as(auditor).post(`/milestones/${readyId}/sign-off`)).status).toBe(404);
    const still = await h.db.query('SELECT status, signed_off_at FROM milestones WHERE id = $1', [readyId]);
    expect(still.rows[0]).toEqual({ status: 'awaiting_signoff', signed_off_at: null });
  });

  test('a milestone that is not ready cannot be signed off', async () => {
    const res = await as(admin).post(`/milestones/${plannedId}/sign-off`);
    expect(res.status).toBe(409);
    expect(h.code(res)).toBe('not_awaiting_signoff');
  });

  test('an admin signs off: name and time are recorded and the audit log has the row', async () => {
    const res = await as(admin).post(`/milestones/${readyId}/sign-off`);
    expect(res.status).toBe(200);
    expect(res.body.milestone).toMatchObject({ status: 'complete', signedOffByName: 'Dana Okafor' });
    expect(res.body.milestone.signedOffAt).toBeTruthy();

    const last = (await auditActions()).pop();
    expect(last).toMatchObject({
      action: 'engagement.milestone_signed_off', actor_role: 'admin',
      metadata: { title: 'Audit report delivered', signedOffBy: 'Dana Okafor', engagementId },
    });
    const row = (await h.db.query('SELECT actor_user_id, target_id, row_hash, prev_hash FROM audit_log WHERE org_id = $1 ORDER BY id DESC LIMIT 1', [org.id])).rows[0];
    expect(row.actor_user_id).toBe(admin.user.id);
    expect(row.target_id).toBe(readyId);
    expect(row.row_hash).toHaveLength(64);
    expect(row.prev_hash).toHaveLength(64);

    // Once only, and the queue is clear.
    expect(h.code(await as(admin).post(`/milestones/${readyId}/sign-off`))).toBe('not_awaiting_signoff');
    expect((await as(admin).get('/actions')).body.actions).toEqual([]);
  });

  test('what a client signed can no longer be edited or removed by staff', async () => {
    expect(h.code(await adminApi().patch(`/milestones/${readyId}`, { title: 'Something else' }))).toBe('signed_off');
    expect(h.code(await adminApi().del(`/milestones/${readyId}`))).toBe('signed_off');
    expect((await adminApi().del(`/milestones/${plannedId}`)).status).toBe(200);
  });

  test('the activity list shows engagement events to every role, and nothing else', async () => {
    const res = await as(reviewer).get('/activity');
    expect(res.status).toBe(200);
    expect(res.body.activity[0]).toMatchObject({ summary: 'Milestone removed: Sandbox walkthrough', actor: 'MonkFlow' });
    expect(res.body.activity[1]).toMatchObject({ summary: 'Signed off: Audit report delivered', actor: 'Dana Okafor' });
    expect(res.body.activity.map((a) => a.summary)).toContain('Moved to Architecture and sandbox');
    expect(res.body.activity.every((a) => /^(engagement|action)\./.test(a.action))).toBe(true);
  });
});

describe('requests from MonkFlow', () => {
  let actionId;

  test('staff ask; an admin or reviewer marks it done; an auditor cannot', async () => {
    const made = await adminApi().post('/actions', { kind: 'credentials', title: 'Send a read-only Yardi export login', dueOn: '2026-11-20' });
    expect(made.status).toBe(201);
    actionId = made.body.action.id;

    const queue = (await as(auditor).get('/actions')).body.actions;
    expect(queue).toEqual([expect.objectContaining({ id: actionId, kind: 'credentials', dueOn: '2026-11-20', canAct: false })]);
    expect((await as(auditor).post(`/actions/${actionId}/complete`)).status).toBe(404);

    expect((await as(reviewer).post(`/actions/${actionId}/complete`)).status).toBe(200);
    expect(h.code(await as(admin).post(`/actions/${actionId}/complete`))).toBe('not_open');
    expect((await as(admin).get('/actions')).body.actions).toEqual([]);
    expect((await auditActions()).slice(-2).map((r) => [r.action, r.actor_role])).toEqual([['action.requested', 'monkflow_staff'], ['action.completed', 'reviewer']]);
  });

  test('staff can withdraw an open request, but cannot mark one done for the client', async () => {
    const made = await adminApi().post('/actions', { kind: 'uat', title: 'Run the UAT checklist' });
    expect((await adminApi().del(`/actions/${made.body.action.id}`)).status).toBe(200);
    expect((await adminApi().del(`/actions/${made.body.action.id}`)).status).toBe(404);
    expect((await adminApi().del(`/actions/${actionId}`)).status).toBe(404);   // already done by the client
    expect((await as(admin).get('/actions')).body.actions).toEqual([]);
  });
});

describe('workflows and telemetry', () => {
  let wf, draft, failedRun;

  test('before the first run there is no telemetry, not a row of zeros', async () => {
    const res = await as(admin).get('/telemetry');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ days: 30, started: false, workflows: 0 });
    expect((await as(admin).get('/workflows')).body.workflows).toEqual([]);
  });

  test('staff attach an unassigned workflow; one that belongs to a client cannot be taken', async () => {
    wf = await h.createWorkflow(null, staff, { name: 'Rent roll intake' });
    draft = await h.createWorkflow(org, staff, { name: 'Unfinished draft', status: 'draft' });
    const other = await h.createOrg();
    const theirs = await h.createWorkflow(other, staff, { name: 'Another firm\'s workflow' });

    expect((await adminApi().get('/engagement')).body.unassignedWorkflows.map((w) => w.id)).toContain(wf.id);
    expect((await adminApi().post('/workflows', { workflowId: wf.id })).status).toBe(201);
    expect(h.code(await adminApi().post('/workflows', { workflowId: theirs.id }))).toBe('not_attachable');
    expect((await h.db.query('SELECT org_id FROM workflows WHERE id = $1', [theirs.id])).rows[0].org_id).toBe(other.id);
  });

  test('numbers are counted from run rows', async () => {
    // 30-day window: 5 completed (durations 10s..50s) and 1 failed. One more completed run 40 days ago.
    for (const [daysAgo, durationMs] of [[0, 10000], [1, 20000], [1, 30000], [3, 40000], [10, 50000]]) await h.createRun(wf, { daysAgo, durationMs });
    failedRun = await h.createRun(wf, { daysAgo: 2, status: 'failed', error: 'Source file was empty' });
    await h.createRun(wf, { daysAgo: 40, durationMs: 999000 });
    await h.createRun(draft, { daysAgo: 0 });   // drafts are not shown and not counted

    const t = (await as(auditor).get('/telemetry?days=30')).body;
    expect(t).toMatchObject({ days: 30, started: true, workflows: 1 });
    expect(t.totals).toEqual({ runs: 6, completed: 5, failed: 1, successRate: 5 / 6, medianMs: 30000 });
    expect(t.series).toHaveLength(30);
    expect(t.series.reduce((n, d) => n + d.runs, 0)).toBe(6);
    expect(t.series[t.series.length - 1]).toMatchObject({ runs: 1, completed: 1, failed: 0 });
    expect(t.series[t.series.length - 3]).toMatchObject({ runs: 1, completed: 0, failed: 1 });
    // No baseline has been agreed, so there is no hours figure at all.
    expect(t.saved).toBeNull();

    expect((await as(auditor).get('/telemetry?days=7')).body.totals).toMatchObject({ runs: 5, completed: 4, failed: 1 });
    expect((await as(auditor).get('/telemetry?days=90')).body.totals).toMatchObject({ runs: 7, completed: 6 });
    expect((await as(auditor).get('/telemetry?days=5000')).body.days).toBe(30);
  });

  test('hours saved appears only with a baseline, states its basis, and counts from its first day', async () => {
    // A number without where it came from is refused.
    expect(h.code(await adminApi().patch(`/workflows/${wf.id}`, { baselineMinutesPerRun: 30 }))).toBe('invalid_input');

    const from = new Date(Date.now() - 5 * 864e5).toISOString().slice(0, 10);
    const set = await adminApi().patch(`/workflows/${wf.id}`, { baselineMinutesPerRun: 30, baselineBasis: 'Agreed with Dana Okafor on 3 Nov: 30 minutes to key one rent roll', baselineFrom: from });
    expect(set.status).toBe(200);

    const saved = (await as(admin).get('/telemetry?days=30')).body.saved;
    // 4 completed runs on or after the baseline's first day (0, 1, 1 and 3 days ago), 30 minutes each.
    expect(saved.hours).toBe(2);
    expect(saved.basis).toEqual([expect.objectContaining({
      workflow: 'Rent roll intake', runs: 4, minutesPerRun: 30, from, basis: 'Agreed with Dana Okafor on 3 Nov: 30 minutes to key one rent roll',
    })]);
    expect((await auditActions()).pop()).toMatchObject({ action: 'engagement.baseline_set', metadata: { minutes: 30 } });

    expect((await adminApi().patch(`/workflows/${wf.id}`, { baselineMinutesPerRun: null })).status).toBe(200);
    expect((await as(admin).get('/telemetry')).body.saved).toBeNull();
  });

  test('the list and detail show status and runs, and never the internals', async () => {
    const list = (await as(reviewer).get('/workflows')).body.workflows;
    expect(list).toEqual([expect.objectContaining({ id: wf.id, name: 'Rent roll intake', status: 'active', runs: 6, completed: 5, failed: 1 })]);
    expect(list[0].lastRunAt).toBeTruthy();

    const detail = await as(reviewer).get(`/workflows/${wf.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.runs).toHaveLength(7);
    expect(detail.body.totals).toMatchObject({ runs: 6, medianMs: 30000 });
    const text = JSON.stringify([list, detail.body]);
    for (const hidden of ['webhook', 'definition', 'payload', 'secret', 'result']) expect(text).not.toContain(hidden);

    expect((await as(reviewer).get(`/workflows/${draft.id}`)).status).toBe(404);
    expect((await as(reviewer).get('/workflows/not-a-uuid')).status).toBe(404);
  });

  test('a run shows its outcome and log lines, without debug output', async () => {
    await h.db.query(
      `INSERT INTO execution_logs (user_id, workflow_execution_id, level, message, created_at) VALUES
        ($1, $2, 'info', 'Fetched 1 file', NOW() - INTERVAL '3 seconds'), ($1, $2, 'debug', 'raw response: {...}', NOW() - INTERVAL '2 seconds'),
        ($1, $2, 'error', 'Source file was empty', NOW() - INTERVAL '1 second')`,
      [staff.id, failedRun.id]
    );
    const res = await as(auditor).get(`/workflows/${wf.id}/runs/${failedRun.id}`);
    expect(res.status).toBe(200);
    expect(res.body.workflow.name).toBe('Rent roll intake');
    expect(res.body.run).toMatchObject({ status: 'failed', error: 'Source file was empty' });
    expect(res.body.logs.map((l) => [l.level, l.message])).toEqual([['info', 'Fetched 1 file'], ['error', 'Source file was empty']]);
    // A run id under the wrong workflow is not found.
    expect((await as(auditor).get(`/workflows/${draft.id}/runs/${failedRun.id}`)).status).toBe(404);
  });
});

describe('staff routes', () => {
  test('clients cannot reach them, and ids are tied to the workspace in the URL', async () => {
    const res = await h.api().get(`/api/v1/admin/organizations/${org.id}/engagement`).set('Cookie', admin.cookie);
    expect(res.status).toBe(403);

    const other = await h.createOrg();
    const theirs = (await adminApi(other.id).post('/engagements', { name: 'Other firm\'s engagement' })).body.engagement.id;
    expect((await adminApi().patch(`/engagements/${theirs}`, { stage: 'production' })).status).toBe(404);
    expect((await adminApi().post(`/engagements/${theirs}/milestones`, { stage: 'discovery', title: 'Wrong place' })).status).toBe(404);
    expect(h.code(await adminApi().post('/actions', { kind: 'other', title: 'Cross-workspace', engagementId: theirs }))).toBe('invalid_input');
    expect((await adminApi('00000000-0000-4000-8000-000000000000').get('/engagement')).status).toBe(404);
  });
});
