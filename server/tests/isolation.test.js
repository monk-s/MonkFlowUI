/**
 * Workspace isolation. Two firms, A and B. Everything here asserts that a
 * person in A cannot read or change anything of B's, first through the API
 * and then directly against the database policies the API relies on.
 *
 * The sign-in screen says "your firm's data is isolated from every other
 * client". This file is what makes that sentence true; extend it whenever a
 * portal route or table is added.
 */
const h = require('./helpers');
const { withOrg } = require('../src/portal/withOrg');
const { audit } = require('../src/portal/audit');

let A, B, adminA, adminB, reviewerB, inviteB;
let engB, milestoneB, actionB, workflowB, runB;

beforeAll(async () => {
  A = await h.createOrg({ name: 'Firm A' });
  B = await h.createOrg({ name: 'Firm B' });
  adminA = await h.member(A, 'admin');
  adminB = await h.member(B, 'admin');
  reviewerB = await h.member(B, 'reviewer');
  inviteB = await h.createInvitation(B, 'pending@firm-b.test', 'auditor');
  await h.createInvitation(A, 'pending@firm-a.test', 'auditor');
  await audit(null, null, { orgId: A.id, action: 'test.event_a' });
  await audit(null, null, { orgId: B.id, action: 'test.event_b' });

  // Phase 2: each firm has an engagement, a milestone awaiting sign-off, an
  // open request, a workflow and a run.
  const owner = await h.createUser({ platformAdmin: true });
  const seed = async (org, label) => {
    const eng = (await h.db.query("INSERT INTO engagements (org_id, name) VALUES ($1, $2) RETURNING *", [org.id, `Engagement ${label}`])).rows[0];
    const milestone = (await h.db.query(
      "INSERT INTO milestones (org_id, engagement_id, stage, title, status) VALUES ($1, $2, 'discovery', $3, 'awaiting_signoff') RETURNING *",
      [org.id, eng.id, `Milestone ${label}`]
    )).rows[0];
    const action = (await h.db.query("INSERT INTO action_items (org_id, kind, title) VALUES ($1, 'uat', $2) RETURNING *", [org.id, `Request ${label}`])).rows[0];
    const workflow = await h.createWorkflow(org, owner, { name: `Workflow ${label}` });
    const run = await h.createRun(workflow, { status: 'failed', error: `Error ${label}` });
    await h.db.query("INSERT INTO execution_logs (user_id, workflow_execution_id, level, message) VALUES ($1, $2, 'info', $3)", [owner.id, run.id, `Log ${label}`]);
    await audit(null, null, { orgId: org.id, action: 'engagement.created', metadata: { name: `Engagement ${label}` } });
    return { eng, milestone, action, workflow, run };
  };
  await seed(A, 'A');
  ({ eng: engB, milestone: milestoneB, action: actionB, workflow: workflowB, run: runB } = await seed(B, 'B'));
});
afterAll(h.close);

const as = (who) => ({
  get: (p) => h.api().get(`/api/v1/portal${p}`).set('Cookie', who.cookie),
  post: (p, b) => h.api().post(`/api/v1/portal${p}`).set('Cookie', who.cookie).send(b || {}),
  patch: (p, b) => h.api().patch(`/api/v1/portal${p}`).set('Cookie', who.cookie).send(b || {}),
  del: (p) => h.api().delete(`/api/v1/portal${p}`).set('Cookie', who.cookie),
});

describe('through the API', () => {
  test('lists show only the caller\'s workspace', async () => {
    const team = await as(adminA).get('/team');
    expect(team.body.members.map((m) => m.email)).toEqual([adminA.user.email]);
    expect(team.body.invitations.map((i) => i.email)).toEqual(['pending@firm-a.test']);
    expect((await as(adminA).get('/workspace')).body.workspace.name).toBe('Firm A');
  });

  test('another workspace\'s ids answer 404 and nothing changes', async () => {
    const m = reviewerB.membership.id;
    const i = inviteB.row.id;
    const attempts = await Promise.all([
      as(adminA).patch(`/team/${m}`, { role: 'admin' }),
      as(adminA).patch(`/team/${m}`, { status: 'suspended' }),
      as(adminA).del(`/team/${m}`),
      as(adminA).del(`/invitations/${i}`),
      as(adminA).post(`/invitations/${i}/resend`),
    ]);
    expect(attempts.map((r) => r.status)).toEqual([404, 404, 404, 404, 404]);

    const member = (await h.db.query('SELECT role, status FROM memberships WHERE id = $1', [m])).rows[0];
    expect(member).toEqual({ role: 'reviewer', status: 'active' });
    const invitation = (await h.db.query('SELECT revoked_at FROM invitations WHERE id = $1', [i])).rows[0];
    expect(invitation.revoked_at).toBeNull();
    // B's reviewer is still signed in.
    expect((await as(reviewerB).get('/team')).status).toBe(200);
  });

  test('tracker, actions, activity, workflows and telemetry show only the caller\'s workspace', async () => {
    const [engagements, actions, activity, workflows, telemetry] = await Promise.all(
      ['/engagements', '/actions', '/activity', '/workflows', '/telemetry'].map((p) => as(adminA).get(p))
    );
    expect(engagements.body.engagements.map((e) => e.name)).toEqual(['Engagement A']);
    expect(actions.body.actions.map((a) => a.title).sort()).toEqual(['Milestone A', 'Request A']);
    expect(activity.body.activity.map((a) => a.summary)).toEqual(['Engagement opened: Engagement A']);
    expect(workflows.body.workflows.map((w) => w.name)).toEqual(['Workflow A']);
    expect(telemetry.body.totals).toMatchObject({ runs: 1, failed: 1 });
    expect(JSON.stringify([engagements.body, actions.body, activity.body, workflows.body, telemetry.body])).not.toMatch(/ B\b/);
  });

  test('another workspace\'s milestone, request, workflow and run answer 404 and nothing changes', async () => {
    const attempts = await Promise.all([
      as(adminA).post(`/milestones/${milestoneB.id}/sign-off`),
      as(adminA).post(`/actions/${actionB.id}/complete`),
      as(adminA).get(`/workflows/${workflowB.id}`),
      as(adminA).get(`/workflows/${workflowB.id}/runs/${runB.id}`),
    ]);
    expect(attempts.map((r) => r.status)).toEqual([404, 404, 404, 404]);
    expect((await h.db.query('SELECT status, signed_off_at FROM milestones WHERE id = $1', [milestoneB.id])).rows[0]).toEqual({ status: 'awaiting_signoff', signed_off_at: null });
    expect((await h.db.query('SELECT status FROM action_items WHERE id = $1', [actionB.id])).rows[0].status).toBe('open');
    // B's own admin still can.
    expect((await as(adminB).get(`/workflows/${workflowB.id}/runs/${runB.id}`)).body.logs.map((l) => l.message)).toEqual(['Log B']);
  });

  test('a session cannot be pointed at a workspace the person is not in', async () => {
    const res = await h.api().post('/api/v1/auth/session/workspace').set('Cookie', adminA.cookie).send({ orgId: B.id });
    expect(res.status).toBe(404);
    expect((await as(adminA).get('/workspace')).body.workspace.name).toBe('Firm A');
  });

  test('malformed ids are a 404, not an error', async () => {
    expect((await as(adminA).del('/team/not-a-uuid')).status).toBe(404);
    expect((await as(adminA).del("/invitations/1' OR '1'='1")).status).toBe(404);
  });
});

describe('in the database, even when a query forgets its WHERE', () => {
  test('reads return only the current workspace', async () => {
    const rows = await withOrg(A.id, async (db) => ({
      orgs: (await db.query('SELECT name FROM organizations')).rows,
      memberships: (await db.query('SELECT org_id FROM memberships')).rows,
      invitations: (await db.query('SELECT email FROM invitations')).rows,
      audit: (await db.query("SELECT action FROM audit_log WHERE action LIKE 'test.%'")).rows,
      members: (await db.query('SELECT email FROM org_members')).rows,
    }));
    expect(rows.orgs).toEqual([{ name: 'Firm A' }]);
    expect(rows.memberships.every((r) => r.org_id === A.id)).toBe(true);
    expect(rows.invitations).toEqual([{ email: 'pending@firm-a.test' }]);
    expect(rows.audit).toEqual([{ action: 'test.event_a' }]);
    expect(rows.members).toEqual([{ email: adminA.user.email }]);
  });

  test('writes cannot touch or create another workspace\'s rows', async () => {
    const touched = await withOrg(A.id, async (db) => ({
      members: (await db.query("UPDATE memberships SET role = 'auditor' WHERE org_id = $1", [B.id])).rowCount,
      all: (await db.query("UPDATE invitations SET revoked_at = NOW() WHERE email LIKE 'pending@firm-b%'")).rowCount,
      org: (await db.query("UPDATE organizations SET name = 'Hijacked' WHERE id = $1", [B.id])).rowCount,
      gone: (await db.query('DELETE FROM memberships WHERE org_id = $1', [B.id])).rowCount,
    }));
    expect(touched).toEqual({ members: 0, all: 0, org: 0, gone: 0 });

    await expect(withOrg(A.id, (db) => db.query(
      "INSERT INTO invitations (org_id, email, role, token_hash, expires_at) VALUES ($1, 'x@x.test', 'admin', 'h', NOW() + INTERVAL '1 day')", [B.id]
    ))).rejects.toThrow(/row-level security/);
    await expect(withOrg(A.id, (db) => db.query(
      "INSERT INTO memberships (org_id, user_id, role) VALUES ($1, $2, 'admin')", [B.id, adminA.user.id]
    ))).rejects.toThrow(/row-level security/);
    await expect(withOrg(A.id, (db) => audit(db, null, { orgId: B.id, action: 'test.forged' }))).rejects.toThrow(/row-level security/);
  });

  test('phase 2 tables and views return only the current workspace', async () => {
    const rows = await withOrg(A.id, async (db) => ({
      engagements: (await db.query('SELECT name FROM engagements')).rows,
      milestones: (await db.query('SELECT title FROM milestones')).rows,
      actions: (await db.query('SELECT title FROM action_items')).rows,
      workflows: (await db.query('SELECT name FROM org_workflows')).rows,
      runs: (await db.query('SELECT error_message FROM org_workflow_runs')).rows,
      logs: (await db.query('SELECT message FROM org_run_logs')).rows,
    }));
    expect(rows).toEqual({
      engagements: [{ name: 'Engagement A' }], milestones: [{ title: 'Milestone A' }], actions: [{ title: 'Request A' }],
      workflows: [{ name: 'Workflow A' }], runs: [{ error_message: 'Error A' }], logs: [{ message: 'Log A' }],
    });
  });

  test('the portal role can sign off and complete, and nothing more', async () => {
    const touched = await withOrg(A.id, async (db) => ({
      milestone: (await db.query("UPDATE milestones SET status = 'complete' WHERE id = $1", [milestoneB.id])).rowCount,
      action: (await db.query("UPDATE action_items SET status = 'done' WHERE id = $1", [actionB.id])).rowCount,
    }));
    expect(touched).toEqual({ milestone: 0, action: 0 });

    const denied = [
      "UPDATE milestones SET title = 'Rewritten'",
      "UPDATE action_items SET title = 'Rewritten'",
      'DELETE FROM milestones',
      "UPDATE engagements SET stage = 'production'",
      `INSERT INTO engagements (org_id, name) VALUES ('${A.id}', 'Self-made')`,
      "UPDATE org_workflows SET name = 'Rewritten'",
      'SELECT definition FROM workflows',
      'SELECT trigger_payload FROM workflow_executions',
      'SELECT * FROM execution_logs',
    ];
    for (const sql of denied) await expect(withOrg(A.id, (db) => db.query(sql))).rejects.toThrow(/permission denied/);

    // It may file a request of its own, in its own workspace, and nothing else.
    const insert = (orgId, origin) => withOrg(A.id, (db) => db.query('INSERT INTO action_items (org_id, kind, title, origin) VALUES ($1, $2, $3, $4)', [orgId, 'other', 'Self-made', origin]));
    await expect(insert(A.id, 'monkflow')).rejects.toThrow(/row-level security/);
    await expect(insert(B.id, 'client')).rejects.toThrow(/row-level security/);
    expect((await insert(A.id, 'client')).rowCount).toBe(1);
  });

  test('the portal role cannot read the users or sessions tables at all', async () => {
    await expect(withOrg(A.id, (db) => db.query('SELECT email, password_hash FROM users'))).rejects.toThrow(/permission denied/);
    await expect(withOrg(A.id, (db) => db.query('SELECT token_hash FROM sessions'))).rejects.toThrow(/permission denied/);
    await expect(withOrg(A.id, (db) => db.query('SELECT * FROM workflows'))).rejects.toThrow(/permission denied/);
  });

  test('the workspace setting does not leak to the next query on the same connection', async () => {
    await withOrg(A.id, (db) => db.query('SELECT 1'));
    const { rows } = await h.db.query("SELECT current_user AS role, current_setting('app.org_id', true) AS org");
    expect(rows[0].role).not.toBe('monkflow_portal');
    expect(rows[0].org || '').toBe('');
    // and a failed transaction resets it too
    await withOrg(A.id, (db) => db.query('SELECT 1/0')).catch(() => {});
    const again = await h.db.query('SELECT current_user AS role');
    expect(again.rows[0].role).not.toBe('monkflow_portal');
  });

  test('withOrg refuses to run without a workspace', async () => {
    await expect(withOrg(null, (db) => db.query('SELECT 1'))).rejects.toThrow(/workspace id is required/);
    await expect(withOrg("x'; RESET ROLE; --", (db) => db.query('SELECT 1'))).rejects.toThrow(/workspace id is required/);
  });
});
