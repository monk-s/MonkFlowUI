const catchAsync = require('../utils/catchAsync');
const { query } = require('../config/database');

const getStats = catchAsync(async (req, res) => {
  const userId = req.user.userId;

  // Run all queries in parallel for performance
  const [
    workflowStats,
    agentStats,
    executionStats,
    monthlyExecutions,
    recentActivity,
    upcomingAppointments,
  ] = await Promise.all([
    // Workflow counts by status
    query(
      `SELECT
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE status = 'active')::int as active,
        COUNT(*) FILTER (WHERE status = 'paused')::int as paused,
        COUNT(*) FILTER (WHERE status = 'draft')::int as draft,
        COUNT(*) FILTER (WHERE status = 'error')::int as error
       FROM workflows WHERE user_id = $1`,
      [userId]
    ),

    // Agent counts
    query(
      `SELECT
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE status = 'active')::int as active
       FROM agents WHERE user_id = $1`,
      [userId]
    ),

    // Execution totals (last 30 days)
    query(
      `SELECT
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE we.status = 'completed')::int as completed,
        COUNT(*) FILTER (WHERE we.status = 'failed')::int as failed,
        COUNT(*) FILTER (WHERE we.status = 'running')::int as running
       FROM workflow_executions we
       JOIN workflows w ON we.workflow_id = w.id
       WHERE w.user_id = $1 AND we.started_at >= NOW() - INTERVAL '30 days'`,
      [userId]
    ),

    // Monthly execution counts (last 12 months)
    query(
      `SELECT
        TO_CHAR(DATE_TRUNC('month', we.started_at), 'Mon') as month,
        EXTRACT(YEAR FROM we.started_at)::int as year,
        COUNT(*)::int as count
       FROM workflow_executions we
       JOIN workflows w ON we.workflow_id = w.id
       WHERE w.user_id = $1 AND we.started_at >= NOW() - INTERVAL '12 months'
       GROUP BY DATE_TRUNC('month', we.started_at), EXTRACT(YEAR FROM we.started_at)
       ORDER BY DATE_TRUNC('month', we.started_at) ASC`,
      [userId]
    ),

    // Recent activity (last 10 execution logs)
    query(
      `SELECT el.id, el.level, el.message, el.created_at, el.metadata
       FROM execution_logs el
       WHERE el.user_id = $1
       ORDER BY el.created_at DESC
       LIMIT 10`,
      [userId]
    ),

    // Upcoming appointments (next 5)
    query(
      `SELECT id, date, start_time, end_time, booker_name, booker_email, meeting_type
       FROM appointments
       WHERE user_id = $1 AND date >= CURRENT_DATE AND status != 'cancelled'
       ORDER BY date ASC, start_time ASC
       LIMIT 5`,
      [userId]
    ),
  ]);

  const wf = workflowStats.rows[0] || { total: 0, active: 0, paused: 0, draft: 0, error: 0 };
  const ag = agentStats.rows[0] || { total: 0, active: 0 };
  const ex = executionStats.rows[0] || { total: 0, completed: 0, failed: 0, running: 0 };

  const successRate = ex.total > 0
    ? Math.round((ex.completed / ex.total) * 1000) / 10
    : 0;

  res.json({
    data: {
      workflows: wf,
      agents: ag,
      executions: {
        ...ex,
        successRate,
      },
      chartData: monthlyExecutions.rows,
      recentActivity: recentActivity.rows,
      appointments: upcomingAppointments.rows,
    },
  });
});

const getAnalytics = catchAsync(async (req, res) => {
  const userId = req.user.userId;
  const days = parseInt(req.query.days) || 30;
  const safeDays = Math.min(Math.max(days, 7), 365);

  const [
    executionStats,
    perWorkflow,
    dailyTrend,
    topErrors,
  ] = await Promise.all([
    // Overall execution stats for period
    query(
      `SELECT
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE we.status = 'completed')::int as completed,
        COUNT(*) FILTER (WHERE we.status = 'failed')::int as failed,
        COUNT(*) FILTER (WHERE we.status = 'running')::int as running,
        ROUND(AVG(EXTRACT(EPOCH FROM (we.finished_at - we.started_at)))::numeric, 2) as avg_duration_sec
       FROM workflow_executions we
       JOIN workflows w ON we.workflow_id = w.id
       WHERE w.user_id = $1 AND we.started_at >= NOW() - make_interval(days := $2)`,
      [userId, safeDays]
    ),

    // Per-workflow breakdown
    query(
      `SELECT w.id, w.name, w.status as workflow_status,
        COUNT(we.id)::int as executions,
        COUNT(*) FILTER (WHERE we.status = 'completed')::int as completed,
        COUNT(*) FILTER (WHERE we.status = 'failed')::int as failed,
        ROUND(AVG(EXTRACT(EPOCH FROM (we.finished_at - we.started_at)))::numeric, 2) as avg_duration_sec
       FROM workflows w
       LEFT JOIN workflow_executions we ON we.workflow_id = w.id AND we.started_at >= NOW() - make_interval(days := $2)
       WHERE w.user_id = $1
       GROUP BY w.id, w.name, w.status
       ORDER BY executions DESC
       LIMIT 20`,
      [userId, safeDays]
    ),

    // Daily execution trend
    query(
      `SELECT
        TO_CHAR(d.day, 'Mon DD') as label,
        COALESCE(COUNT(we.id), 0)::int as total,
        COALESCE(COUNT(*) FILTER (WHERE we.status = 'completed'), 0)::int as completed,
        COALESCE(COUNT(*) FILTER (WHERE we.status = 'failed'), 0)::int as failed
       FROM generate_series(
         (NOW() - make_interval(days := $2))::date,
         NOW()::date,
         '1 day'::interval
       ) AS d(day)
       LEFT JOIN workflow_executions we ON DATE(we.started_at) = d.day
         AND we.workflow_id IN (SELECT id FROM workflows WHERE user_id = $1)
       GROUP BY d.day
       ORDER BY d.day ASC`,
      [userId, safeDays]
    ),

    // Top error messages
    query(
      `SELECT el.message, COUNT(*)::int as count
       FROM execution_logs el
       WHERE el.user_id = $1 AND el.level = 'error' AND el.created_at >= NOW() - make_interval(days := $2)
       GROUP BY el.message
       ORDER BY count DESC
       LIMIT 5`,
      [userId, safeDays]
    ),
  ]);

  const ex = executionStats.rows[0] || { total: 0, completed: 0, failed: 0, running: 0, avg_duration_sec: null };
  const successRate = ex.total > 0 ? Math.round((ex.completed / ex.total) * 1000) / 10 : 0;

  res.json({
    data: {
      period: { days: safeDays },
      executions: { ...ex, successRate },
      perWorkflow: perWorkflow.rows,
      dailyTrend: dailyTrend.rows,
      topErrors: topErrors.rows,
    },
  });
});

module.exports = { getStats, getAnalytics };
