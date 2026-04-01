const catchAsync = require('../utils/catchAsync');
const { query } = require('../config/database');
const { paginate, paginatedResponse } = require('../utils/pagination');
const ApiError = require('../utils/ApiError');
const userModel = require('../models/user.model');

const getPlatformStats = catchAsync(async (req, res) => {
  const [
    usersResult,
    workflowsResult,
    agentsResult,
    workflowExecsResult,
    agentExecsResult,
    tokenTotalsResult,
    newUsersResult,
    dailyExecsResult,
  ] = await Promise.all([
    query(`SELECT COUNT(*)::int as total FROM users`),
    query(`SELECT COUNT(*)::int as total FROM workflows`),
    query(`SELECT COUNT(*)::int as total FROM agents`),
    query(
      `SELECT COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE status = 'completed')::int as completed,
        COUNT(*) FILTER (WHERE status = 'failed')::int as failed
       FROM workflow_executions`
    ),
    query(
      `SELECT COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE status = 'completed')::int as completed,
        COUNT(*) FILTER (WHERE status = 'failed')::int as failed
       FROM agent_executions`
    ),
    query(
      `SELECT COALESCE(SUM(tokens_input),0)::bigint as total_input,
        COALESCE(SUM(tokens_output),0)::bigint as total_output
       FROM agent_executions`
    ),
    query(
      `SELECT COUNT(*)::int as total FROM users
       WHERE created_at >= DATE_TRUNC('month', NOW())`
    ),
    query(
      `SELECT DATE(started_at) as date, COUNT(*)::int as count
       FROM workflow_executions
       WHERE started_at >= NOW() - INTERVAL '30 days'
       GROUP BY DATE(started_at)
       ORDER BY date`
    ),
  ]);

  res.json({
    data: {
      users: usersResult.rows[0],
      workflows: workflowsResult.rows[0],
      agents: agentsResult.rows[0],
      workflowExecs: workflowExecsResult.rows[0],
      agentExecs: agentExecsResult.rows[0],
      tokenTotals: tokenTotalsResult.rows[0],
      newUsersThisMonth: newUsersResult.rows[0],
      dailyExecs: dailyExecsResult.rows,
    },
  });
});

const getAccounts = catchAsync(async (req, res) => {
  const { page, limit, offset } = paginate(req.query);

  const [accountsResult, countResult] = await Promise.all([
    query(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.company, u.role, u.created_at, u.updated_at,
        (SELECT COUNT(*)::int FROM workflows WHERE user_id = u.id) as workflow_count,
        (SELECT COUNT(*)::int FROM agents WHERE user_id = u.id) as agent_count,
        (SELECT COUNT(*)::int FROM workflow_executions we JOIN workflows w ON we.workflow_id = w.id WHERE w.user_id = u.id AND we.started_at >= NOW() - INTERVAL '30 days') as recent_workflow_runs,
        (SELECT COUNT(*)::int FROM agent_executions ae JOIN agents a ON ae.agent_id = a.id WHERE a.user_id = u.id AND ae.started_at >= NOW() - INTERVAL '30 days') as recent_agent_tasks,
        (SELECT COALESCE(SUM(ae2.tokens_input),0)::bigint FROM agent_executions ae2 JOIN agents a2 ON ae2.agent_id = a2.id WHERE a2.user_id = u.id) as total_tokens_input,
        (SELECT COALESCE(SUM(ae2.tokens_output),0)::bigint FROM agent_executions ae2 JOIN agents a2 ON ae2.agent_id = a2.id WHERE a2.user_id = u.id) as total_tokens_output
       FROM users u ORDER BY u.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    ),
    query(`SELECT COUNT(*)::int as total FROM users`),
  ]);

  res.json(paginatedResponse(accountsResult.rows, countResult.rows[0].total, { page, limit }));
});

const getAccountDetail = catchAsync(async (req, res) => {
  const { userId } = req.params;

  const [userResult, workflowsResult, agentsResult, execsResult, projectsResult] = await Promise.all([
    query(`SELECT * FROM users WHERE id = $1`, [userId]),
    query(
      `SELECT id, name, status, trigger_type, total_runs, success_rate, last_run_at, created_at
       FROM workflows WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [userId]
    ),
    query(
      `SELECT id, name, agent_type, model, status, total_tasks, total_tokens_used, created_at
       FROM agents WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [userId]
    ),
    query(
      `SELECT we.id, we.status, we.started_at, we.completed_at, we.duration_ms, we.error_message, w.name as workflow_name
       FROM workflow_executions we
       JOIN workflows w ON we.workflow_id = w.id
       WHERE w.user_id = $1
       ORDER BY we.started_at DESC LIMIT 20`,
      [userId]
    ),
    query(
      `SELECT p.*,
        (SELECT COUNT(*) FROM project_files pf WHERE pf.project_id = p.id) as file_count,
        (SELECT pu.message FROM project_updates pu WHERE pu.project_id = p.id ORDER BY pu.created_at DESC LIMIT 1) as latest_update
       FROM projects p
       WHERE p.user_id = $1
       ORDER BY p.updated_at DESC`,
      [userId]
    ),
  ]);

  if (userResult.rows.length === 0) {
    throw ApiError.notFound('User not found');
  }

  res.json({
    data: {
      user: userModel.sanitize(userResult.rows[0]),
      workflows: workflowsResult.rows,
      agents: agentsResult.rows,
      recentExecutions: execsResult.rows,
      projects: projectsResult.rows,
    },
  });
});

const getCostAnalytics = catchAsync(async (req, res) => {
  const [byModelResult, byUserResult, dailyBurnResult] = await Promise.all([
    query(
      `SELECT a.model,
        COALESCE(SUM(ae.tokens_input),0)::bigint as tokens_input,
        COALESCE(SUM(ae.tokens_output),0)::bigint as tokens_output,
        COUNT(*)::int as exec_count
       FROM agent_executions ae
       JOIN agents a ON ae.agent_id = a.id
       GROUP BY a.model
       ORDER BY tokens_input + tokens_output DESC`
    ),
    query(
      `SELECT u.id, u.email, u.first_name, u.last_name,
        COALESCE(SUM(ae.tokens_input),0)::bigint as tokens_input,
        COALESCE(SUM(ae.tokens_output),0)::bigint as tokens_output
       FROM users u
       LEFT JOIN agents a ON a.user_id = u.id
       LEFT JOIN agent_executions ae ON ae.agent_id = a.id
       GROUP BY u.id, u.email, u.first_name, u.last_name
       ORDER BY COALESCE(SUM(ae.tokens_input),0) + COALESCE(SUM(ae.tokens_output),0) DESC
       LIMIT 10`
    ),
    query(
      `SELECT DATE(ae.started_at) as date,
        COALESCE(SUM(ae.tokens_input),0)::bigint as tokens_input,
        COALESCE(SUM(ae.tokens_output),0)::bigint as tokens_output
       FROM agent_executions ae
       WHERE ae.started_at >= NOW() - INTERVAL '30 days'
       GROUP BY DATE(ae.started_at)
       ORDER BY date`
    ),
  ]);

  res.json({
    data: {
      byModel: byModelResult.rows,
      byUser: byUserResult.rows,
      dailyBurn: dailyBurnResult.rows,
    },
  });
});

const getAlerts = catchAsync(async (req, res) => {
  const [inactiveUsersResult, failedWorkflowsResult, failedAgentsResult] = await Promise.all([
    query(
      `SELECT id, email, first_name, last_name, updated_at
       FROM users WHERE updated_at < NOW() - INTERVAL '30 days'`
    ),
    query(
      `SELECT COUNT(*)::int as count FROM workflow_executions
       WHERE status = 'failed' AND started_at >= NOW() - INTERVAL '24 hours'`
    ),
    query(
      `SELECT COUNT(*)::int as count FROM agent_executions
       WHERE status = 'failed' AND started_at >= NOW() - INTERVAL '24 hours'`
    ),
  ]);

  const alerts = [];

  if (inactiveUsersResult.rows.length > 0) {
    alerts.push({
      type: 'inactive_users',
      message: `${inactiveUsersResult.rows.length} user(s) inactive for 30+ days`,
      severity: 'warning',
      users: inactiveUsersResult.rows,
    });
  }

  const failedWorkflows = failedWorkflowsResult.rows[0].count;
  if (failedWorkflows > 0) {
    alerts.push({
      type: 'failed_workflow_executions',
      message: `${failedWorkflows} failed workflow execution(s) in the last 24 hours`,
      severity: failedWorkflows > 10 ? 'critical' : 'warning',
    });
  }

  const failedAgents = failedAgentsResult.rows[0].count;
  if (failedAgents > 0) {
    alerts.push({
      type: 'failed_agent_executions',
      message: `${failedAgents} failed agent execution(s) in the last 24 hours`,
      severity: failedAgents > 10 ? 'critical' : 'warning',
    });
  }

  res.json({
    data: { alerts },
  });
});

module.exports = { getPlatformStats, getAccounts, getAccountDetail, getCostAnalytics, getAlerts };
