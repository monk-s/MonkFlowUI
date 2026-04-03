const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const integrationModel = require('../models/integration.model');
const integrationService = require('../services/integration.service');

/**
 * List all integrations for the current user
 */
const list = catchAsync(async (req, res) => {
  const integrations = await integrationModel.findByUser(req.user.userId);
  res.json({ data: integrations });
});

/**
 * Get a specific integration by provider
 */
const getByProvider = catchAsync(async (req, res) => {
  const integration = await integrationModel.findByUserAndProvider(req.user.userId, req.params.provider);
  if (!integration) {
    return res.json({ data: { provider: req.params.provider, status: 'disconnected', config: {} } });
  }
  // Strip sensitive fields from config before returning
  const safeConfig = sanitizeConfig(integration.config, integration.provider);
  res.json({ data: { ...integration, config: safeConfig } });
});

/**
 * Test a connection with provided credentials (does not save)
 */
const test = catchAsync(async (req, res) => {
  const { provider } = req.params;
  const { config } = req.body;
  if (!config || typeof config !== 'object') {
    throw ApiError.badRequest('Config object is required');
  }

  try {
    const result = await integrationService.testConnection(provider, config);
    res.json({ data: { success: true, provider, details: result } });
  } catch (err) {
    res.json({ data: { success: false, provider, error: err.message } });
  }
});

/**
 * Connect (save credentials after testing)
 */
const connect = catchAsync(async (req, res) => {
  const { provider } = req.params;
  const { config } = req.body;
  if (!config || typeof config !== 'object') {
    throw ApiError.badRequest('Config object is required');
  }

  // Test the connection first
  try {
    await integrationService.testConnection(provider, config);
  } catch (err) {
    throw ApiError.badRequest(`Connection failed: ${err.message}`);
  }

  // Save the integration
  const integration = await integrationModel.upsert(req.user.userId, provider, config, 'connected');
  const safeConfig = sanitizeConfig(integration.config, integration.provider);
  res.json({ data: { ...integration, config: safeConfig }, message: `${provider} connected successfully` });
});

/**
 * Disconnect an integration
 */
const disconnect = catchAsync(async (req, res) => {
  const { provider } = req.params;
  await integrationModel.disconnect(req.user.userId, provider);
  res.json({ message: `${provider} disconnected` });
});

/**
 * Remove sensitive values from config for frontend display.
 * Shows last 4 chars of tokens/keys for identification.
 */
function sanitizeConfig(config, provider) {
  if (!config || typeof config !== 'object') return {};
  const safe = { ...config };
  const sensitiveKeys = ['botToken', 'secretKey', 'personalAccessToken', 'accessToken',
    'authToken', 'integrationToken', 'serviceAccountKey', 'private_key'];
  for (const key of sensitiveKeys) {
    if (safe[key] && typeof safe[key] === 'string') {
      const val = safe[key];
      safe[key] = val.length > 8 ? '••••' + val.slice(-4) : '••••••••';
    }
  }
  return safe;
}

module.exports = { list, getByProvider, test, connect, disconnect };
