const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const agentModel = require('../models/agent.model');
const agentExecutor = require('../services/agent.executor');
const { paginate, paginatedResponse } = require('../utils/pagination');

const list = catchAsync(async (req, res) => {
  const { page, limit, offset } = paginate(req.query);
  const [rows, total] = await Promise.all([
    agentModel.findByUser(req.user.userId, { limit, offset }),
    agentModel.countByUser(req.user.userId),
  ]);
  res.json(paginatedResponse(rows, total, { page, limit }));
});

const getById = catchAsync(async (req, res) => {
  const agent = await agentModel.findById(req.params.id);
  if (!agent || agent.user_id !== req.user.userId) throw ApiError.notFound('Agent not found');
  res.json({ data: agent });
});

const create = catchAsync(async (req, res) => {
  const agent = await agentModel.create({ userId: req.user.userId, ...req.validated });
  res.status(201).json({ data: agent });
});

const update = catchAsync(async (req, res) => {
  const agent = await agentModel.findById(req.params.id);
  if (!agent || agent.user_id !== req.user.userId) throw ApiError.notFound('Agent not found');

  const fields = {};
  const v = req.validated;
  if (v.name !== undefined) fields.name = v.name;
  if (v.description !== undefined) fields.description = v.description;
  if (v.icon !== undefined) fields.icon = v.icon;
  if (v.agentType !== undefined) fields.agent_type = v.agentType;
  if (v.model !== undefined) fields.model = v.model;
  if (v.systemPrompt !== undefined) fields.system_prompt = v.systemPrompt;
  if (v.temperature !== undefined) fields.temperature = v.temperature;
  if (v.maxTokens !== undefined) fields.max_tokens = v.maxTokens;
  if (v.status !== undefined) fields.status = v.status;

  const updated = await agentModel.update(agent.id, fields);
  res.json({ data: updated });
});

const remove = catchAsync(async (req, res) => {
  const agent = await agentModel.findById(req.params.id);
  if (!agent || agent.user_id !== req.user.userId) throw ApiError.notFound('Agent not found');
  await agentModel.deleteById(agent.id);
  res.json({ message: 'Agent deleted' });
});

const execute = catchAsync(async (req, res) => {
  const agent = await agentModel.findById(req.params.id);
  if (!agent || agent.user_id !== req.user.userId) throw ApiError.notFound('Agent not found');
  if (agent.status !== 'active') throw ApiError.badRequest('Agent is not active');

  const execution = await agentExecutor.executeAgent(agent, req.validated.input, req.user.userId);
  res.json({ data: { executionId: execution.id, status: execution.status } });
});

const listExecutions = catchAsync(async (req, res) => {
  const agent = await agentModel.findById(req.params.id);
  if (!agent || agent.user_id !== req.user.userId) throw ApiError.notFound('Agent not found');

  const { limit, offset } = paginate(req.query);
  const executions = await agentModel.findExecutionsByAgent(agent.id, limit, offset);
  res.json({ data: executions });
});

const enhancePrompt = catchAsync(async (req, res) => {
  const { prompt } = req.body;
  if (!prompt || typeof prompt !== 'string' || prompt.trim().length < 10) {
    throw ApiError.badRequest('Prompt must be at least 10 characters');
  }
  const enhanced = await agentExecutor.enhancePrompt(prompt.trim());
  res.json({ data: { original: prompt, enhanced } });
});

module.exports = { list, getById, create, update, remove, execute, listExecutions, enhancePrompt };
