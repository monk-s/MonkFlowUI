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
        COUNT(*) FILTER (WHERE status = 'completed')::int as completed,
        COUNT(*) FILTER (WHERE status = 'failed')::int as failed,
        COUNT(*) FILTER (WHERE status = 'running')::int as running
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
      `SELECT id, date, start_time, end_time, booker_name, booker_email, meeting_type, status
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

module.exports = { getStats };
