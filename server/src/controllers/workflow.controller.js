const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const workflowModel = require('../models/workflow.model');
const { executeWorkflow } = require('../services/workflow.engine');
const scheduler = require('../services/workflow.scheduler');
const { generateToken } = require('../utils/crypto');
const { paginate, paginatedResponse } = require('../utils/pagination');

const list = catchAsync(async (req, res) => {
  const { page, limit, offset } = paginate(req.query);
  const status = req.query.status || null;
  const [rows, total] = await Promise.all([
    workflowModel.findByUser(req.user.userId, { status, limit, offset }),
    workflowModel.countByUser(req.user.userId, status),
  ]);
  res.json(paginatedResponse(rows, total, { page, limit }));
});

const getById = catchAsync(async (req, res) => {
  const workflow = await workflowModel.findById(req.params.id);
  if (!workflow || workflow.user_id !== req.user.userId) throw ApiError.notFound('Workflow not found');
  res.json({ data: workflow });
});

const create = catchAsync(async (req, res) => {
  const { name, description, triggerType, triggerConfig, definition, cronExpression } = req.validated;
  const webhookSecret = triggerType === 'webhook' ? generateToken(32) : null;

  const workflow = await workflowModel.create({
    userId: req.user.userId,
    name,
    description,
    triggerType,
    triggerConfig,
    definition,
    webhookSecret,
    cronExpression,
  });

  res.status(201).json({ data: workflow });
});

const update = catchAsync(async (req, res) => {
  const workflow = await workflowModel.findById(req.params.id);
  if (!workflow || workflow.user_id !== req.user.userId) throw ApiError.notFound('Workflow not found');

  const fields = {};
  const v = req.validated;
  if (v.name !== undefined) fields.name = v.name;
  if (v.description !== undefined) fields.description = v.description;
  if (v.status !== undefined) fields.status = v.status;
  if (v.triggerType !== undefined) fields.trigger_type = v.triggerType;
  if (v.triggerConfig !== undefined) fields.trigger_config = v.triggerConfig;
  if (v.definition !== undefined) fields.definition = v.definition;
  if (v.cronExpression !== undefined) fields.cron_expression = v.cronExpression;

  const updated = await workflowModel.update(workflow.id, fields);

  // Update scheduler if needed
  if (updated.trigger_type === 'schedule' && updated.status === 'active') {
    scheduler.scheduleWorkflow(updated);
  } else {
    scheduler.unscheduleWorkflow(updated.id);
  }

  res.json({ data: updated });
});

const remove = catchAsync(async (req, res) => {
  const workflow = await workflowModel.findById(req.params.id);
  if (!workflow || workflow.user_id !== req.user.userId) throw ApiError.notFound('Workflow not found');

  scheduler.unscheduleWorkflow(workflow.id);
  await workflowModel.deleteById(workflow.id);
  res.json({ message: 'Workflow deleted' });
});

const execute = catchAsync(async (req, res) => {
  const workflow = await workflowModel.findById(req.params.id);
  if (!workflow || workflow.user_id !== req.user.userId) throw ApiError.notFound('Workflow not found');

  // Execute asynchronously
  const result = executeWorkflow(workflow, { trigger: 'manual', payload: req.body.payload || {} });

  // Don't await — return immediately
  result.catch(err => console.error(`Workflow ${workflow.id} execution error:`, err.message));

  res.json({ message: 'Workflow execution started', workflowId: workflow.id });
});

const listExecutions = catchAsync(async (req, res) => {
  const workflow = await workflowModel.findById(req.params.id);
  if (!workflow || workflow.user_id !== req.user.userId) throw ApiError.notFound('Workflow not found');

  const { limit, offset } = paginate(req.query);
  const executions = await workflowModel.findExecutionsByWorkflow(workflow.id, limit, offset);
  res.json({ data: executions });
});

module.exports = { list, getById, create, update, remove, execute, listExecutions };
