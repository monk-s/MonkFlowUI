const catchAsync = require('../utils/catchAsync');
const planModel = require('../models/plan.model');
const { query } = require('../config/database');

const listPlans = catchAsync(async (req, res) => {
  const plans = await planModel.findAll();
  res.json({ data: plans });
});

const getMyUsage = catchAsync(async (req, res) => {
  const { rows } = await query(
    `SELECT u.plan_id, u.monthly_workflow_runs, u.monthly_agent_tasks, u.usage_reset_at,
            p.slug, p.name as plan_name, p.price_cents, p.monthly_workflow_runs as plan_workflow_limit,
            p.monthly_agent_tasks as plan_task_limit, p.allowed_models, p.overage_run_cents, p.overage_task_cents
     FROM users u LEFT JOIN plans p ON u.plan_id = p.id
     WHERE u.id = $1`,
    [req.user.userId]
  );
  const usage = rows[0] || {};
  res.json({ data: usage });
});

module.exports = { listPlans, getMyUsage };
