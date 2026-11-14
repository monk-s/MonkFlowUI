/**
 * /api/v1/portal — workflows, runs and telemetry. Read-only for clients.
 * Follows the rules at the top of ./index.js.
 *
 * Every number here is counted from this workspace's own run rows at the
 * moment of the request (views org_workflows / org_workflow_runs /
 * org_run_logs, migration 052). Nothing is estimated or carried over from a
 * sample. Where there is nothing to count, the value is null and the portal
 * says so instead of showing a zero.
 *
 * Days are UTC calendar days.
 */
const router = require('express').Router();
const catchAsync = require('../../utils/catchAsync');
const ApiError = require('../../utils/ApiError');
const { requirePermission } = require('../../middleware/session');
const { withOrg, UUID } = require('../../portal/withOrg');
const { day } = require('../../portal/engagements');

const PERIODS = [7, 30, 90];
const period = (req) => (PERIODS.includes(Number(req.query.days)) ? Number(req.query.days) : 30);
const rate = (ok, failed) => (ok + failed > 0 ? ok / (ok + failed) : null);
const num = (v) => (v == null ? null : Number(v));

// First day of a period that ends today (UTC) and is `days` long.
const SINCE = "((NOW() AT TIME ZONE 'UTC')::date - ($1::int - 1))";
const RUN_DAY = "(r.started_at AT TIME ZONE 'UTC')::date";

const workflowView = (w) => ({
  id: w.id, name: w.name, description: w.description, status: w.status, trigger: w.trigger_type, createdAt: w.created_at,
});

// Hours saved = completed runs on or after the baseline's first day, times
// the agreed minutes per run. Only workflows that have a baseline count.
async function hoursSaved(db, days, workflowId) {
  const { rows } = await db.query(
    `SELECT w.id, w.name, w.baseline_minutes_per_run AS minutes, w.baseline_basis AS basis, w.baseline_from,
            count(r.id)::int AS runs
       FROM org_workflows w
       LEFT JOIN org_workflow_runs r
              ON r.workflow_id = w.id AND r.status = 'completed'
             AND ${RUN_DAY} >= GREATEST(${SINCE}, COALESCE(w.baseline_from, DATE '2000-01-01'))
      WHERE w.baseline_minutes_per_run IS NOT NULL AND ($2::uuid IS NULL OR w.id = $2)
      GROUP BY w.id, w.name, w.baseline_minutes_per_run, w.baseline_basis, w.baseline_from
      ORDER BY w.name`,
    [days, workflowId || null]
  );
  if (!rows.length) return null;
  const basis = rows.map((b) => ({
    workflowId: b.id, workflow: b.name, runs: b.runs, minutesPerRun: Number(b.minutes), basis: b.basis, from: day(b.baseline_from),
    hours: (b.runs * Number(b.minutes)) / 60,
  }));
  return { hours: basis.reduce((sum, b) => sum + b.hours, 0), basis };
}

// One row per day of the period, including days with no runs.
async function dailySeries(db, days, workflowId) {
  const { rows } = await db.query(
    `SELECT d::date AS day,
            count(r.id)::int AS runs,
            count(r.id) FILTER (WHERE r.status = 'completed')::int AS completed,
            count(r.id) FILTER (WHERE r.status = 'failed')::int AS failed
       FROM generate_series(${SINCE}, (NOW() AT TIME ZONE 'UTC')::date, INTERVAL '1 day') d
       LEFT JOIN org_workflow_runs r ON ${RUN_DAY} = d::date AND ($2::uuid IS NULL OR r.workflow_id = $2)
      GROUP BY d ORDER BY d`,
    [days, workflowId || null]
  );
  return rows.map((r) => ({ day: day(r.day), runs: r.runs, completed: r.completed, failed: r.failed }));
}

async function totals(db, days, workflowId) {
  const { rows } = await db.query(
    `SELECT count(*)::int AS runs,
            count(*) FILTER (WHERE r.status = 'completed')::int AS completed,
            count(*) FILTER (WHERE r.status = 'failed')::int AS failed,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY r.duration_ms)
              FILTER (WHERE r.status = 'completed' AND r.duration_ms IS NOT NULL) AS median_ms
       FROM org_workflow_runs r
      WHERE ${RUN_DAY} >= ${SINCE} AND ($2::uuid IS NULL OR r.workflow_id = $2)`,
    [days, workflowId || null]
  );
  const t = rows[0];
  return { runs: t.runs, completed: t.completed, failed: t.failed, successRate: rate(t.completed, t.failed), medianMs: num(t.median_ms) };
}

router.get('/telemetry', requirePermission('overview.view'), catchAsync(async (req, res) => {
  const days = period(req);
  const out = await withOrg(req.session.orgId, async (db) => {
    const first = (await db.query('SELECT min(started_at) AS first_run, (SELECT count(*)::int FROM org_workflows) AS workflows FROM org_workflow_runs')).rows[0];
    // Before the first run there is nothing to measure, and the portal says
    // that rather than showing a row of zeros.
    if (!first.first_run) return { started: false, workflows: first.workflows };
    return {
      started: true, workflows: first.workflows, firstRunAt: first.first_run,
      totals: await totals(db, days), series: await dailySeries(db, days), saved: await hoursSaved(db, days),
    };
  });
  res.json({ days, ...out });
}));

router.get('/workflows', requirePermission('workflows.view'), catchAsync(async (req, res) => {
  const days = period(req);
  const rows = await withOrg(req.session.orgId, async (db) => (await db.query(
    `SELECT w.*,
            (SELECT max(r.started_at) FROM org_workflow_runs r WHERE r.workflow_id = w.id) AS last_run,
            s.runs, s.completed, s.failed
       FROM org_workflows w
       LEFT JOIN LATERAL (
         SELECT count(*)::int AS runs,
                count(*) FILTER (WHERE r.status = 'completed')::int AS completed,
                count(*) FILTER (WHERE r.status = 'failed')::int AS failed
           FROM org_workflow_runs r
          WHERE r.workflow_id = w.id AND ${RUN_DAY} >= ${SINCE}
       ) s ON TRUE
      ORDER BY lower(w.name)`,
    [days]
  )).rows);
  res.json({
    days,
    workflows: rows.map((w) => ({
      ...workflowView(w), lastRunAt: w.last_run, runs: w.runs, completed: w.completed, failed: w.failed, successRate: rate(w.completed, w.failed),
    })),
  });
}));

const runView = (r) => ({
  id: r.id, status: r.status, trigger: r.trigger_type, startedAt: r.started_at, completedAt: r.completed_at,
  durationMs: num(r.duration_ms), error: r.error_message,
});

router.get('/workflows/:id', requirePermission('workflows.view'), catchAsync(async (req, res) => {
  if (!UUID.test(req.params.id)) throw ApiError.notFound('Not found');
  const days = period(req);
  const out = await withOrg(req.session.orgId, async (db) => {
    const workflow = (await db.query('SELECT * FROM org_workflows WHERE id = $1', [req.params.id])).rows[0];
    if (!workflow) return null;
    return {
      workflow,
      totals: await totals(db, days, workflow.id),
      series: await dailySeries(db, days, workflow.id),
      saved: await hoursSaved(db, days, workflow.id),
      runs: (await db.query('SELECT * FROM org_workflow_runs WHERE workflow_id = $1 ORDER BY started_at DESC LIMIT 50', [workflow.id])).rows,
    };
  });
  if (!out) throw ApiError.notFound('Not found');
  res.json({ days, workflow: workflowView(out.workflow), totals: out.totals, series: out.series, saved: out.saved, runs: out.runs.map(runView) });
}));

router.get('/workflows/:id/runs/:runId', requirePermission('workflows.view'), catchAsync(async (req, res) => {
  if (!UUID.test(req.params.id) || !UUID.test(req.params.runId)) throw ApiError.notFound('Not found');
  const out = await withOrg(req.session.orgId, async (db) => {
    const run = (await db.query(
      `SELECT r.*, w.name AS workflow_name FROM org_workflow_runs r JOIN org_workflows w ON w.id = r.workflow_id
        WHERE r.id = $1 AND r.workflow_id = $2`,
      [req.params.runId, req.params.id]
    )).rows[0];
    if (!run) return null;
    const logs = (await db.query('SELECT id, level, message, created_at FROM org_run_logs WHERE run_id = $1 ORDER BY created_at, id LIMIT 500', [run.id])).rows;
    return { run, logs };
  });
  if (!out) throw ApiError.notFound('Not found');
  res.json({
    workflow: { id: req.params.id, name: out.run.workflow_name },
    run: runView(out.run),
    logs: out.logs.map((l) => ({ id: l.id, level: l.level, message: l.message, at: l.created_at })),
  });
}));

module.exports = router;
