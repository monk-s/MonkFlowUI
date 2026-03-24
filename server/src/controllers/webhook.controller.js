const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const workflowModel = require('../models/workflow.model');
const { executeWorkflow } = require('../services/workflow.engine');

const trigger = catchAsync(async (req, res) => {
  const workflow = await workflowModel.findByWebhookId(req.params.webhookId);
  if (!workflow) throw ApiError.notFound('Webhook not found');

  if (workflow.status !== 'active') {
    throw ApiError.badRequest('Workflow is not active');
  }

  // Verify webhook secret
  const secret = req.headers['x-webhook-secret'];
  if (workflow.webhook_secret && secret !== workflow.webhook_secret) {
    throw ApiError.unauthorized('Invalid webhook secret');
  }

  // Execute asynchronously
  const result = executeWorkflow(workflow, { trigger: 'webhook', payload: req.body });
  result.catch(err => console.error(`Webhook workflow ${workflow.id} error:`, err.message));

  res.json({ message: 'Webhook received', workflowId: workflow.id });
});

module.exports = { trigger };
