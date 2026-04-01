const { query } = require('../config/database');
const planModel = require('../models/plan.model');
const ApiError = require('../utils/ApiError');

const checkWorkflowRunLimit = async (req, res, next) => {
  try {
    if (req.user.role === 'superadmin') return next();

    const { rows } = await query('SELECT plan_id, monthly_workflow_runs, usage_reset_at FROM users WHERE id = $1', [req.user.userId]);
    const user = rows[0];
    if (!user || !user.plan_id) return next();

    // Reset if new month
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    if (!user.usage_reset_at || new Date(user.usage_reset_at) < monthStart) {
      await query("UPDATE users SET monthly_workflow_runs = 0, monthly_agent_tasks = 0, usage_reset_at = DATE_TRUNC('month', NOW()) WHERE id = $1", [req.user.userId]);
      user.monthly_workflow_runs = 0;
    }

    const plan = await planModel.findById(user.plan_id);
    if (!plan) return next();

    if (user.monthly_workflow_runs >= plan.monthly_workflow_runs) {
      throw ApiError.tooMany(`Monthly workflow run limit reached (${plan.monthly_workflow_runs}). Upgrade your plan for more runs.`);
    }

    next();
  } catch (err) {
    if (err.statusCode) throw err; // Re-throw ApiErrors
    next(err);
  }
};

const checkAgentTaskLimit = async (req, res, next) => {
  try {
    if (req.user.role === 'superadmin') return next();

    const { rows } = await query('SELECT plan_id, monthly_agent_tasks, usage_reset_at FROM users WHERE id = $1', [req.user.userId]);
    const user = rows[0];
    if (!user || !user.plan_id) return next();

    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    if (!user.usage_reset_at || new Date(user.usage_reset_at) < monthStart) {
      await query("UPDATE users SET monthly_workflow_runs = 0, monthly_agent_tasks = 0, usage_reset_at = DATE_TRUNC('month', NOW()) WHERE id = $1", [req.user.userId]);
      user.monthly_agent_tasks = 0;
    }

    const plan = await planModel.findById(user.plan_id);
    if (!plan) return next();

    if (user.monthly_agent_tasks >= plan.monthly_agent_tasks) {
      throw ApiError.tooMany(`Monthly agent task limit reached (${plan.monthly_agent_tasks}). Upgrade your plan for more tasks.`);
    }

    next();
  } catch (err) {
    if (err.statusCode) throw err;
    next(err);
  }
};

module.exports = { checkWorkflowRunLimit, checkAgentTaskLimit };
