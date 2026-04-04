const env = require('../config/env');
const agentModel = require('../models/agent.model');
const { query } = require('../config/database');
const logger = require('../utils/logger');

// Simple concurrency limiter
let activeCount = 0;
const MAX_CONCURRENT = 3;
const waitQueue = [];

function acquireSlot() {
  return new Promise((resolve) => {
    if (activeCount < MAX_CONCURRENT) {
      activeCount++;
      resolve();
    } else {
      waitQueue.push(resolve);
    }
  });
}

function releaseSlot() {
  activeCount--;
  if (waitQueue.length > 0) {
    activeCount++;
    const next = waitQueue.shift();
    next();
  }
}

/**
 * Execute an agent with given input.
 * Returns the execution record.
 */
async function executeAgent(agent, inputData, userId) {
  const execution = await agentModel.createExecution({
    agentId: agent.id,
    inputData,
  });

  // Process asynchronously
  processExecution(agent, execution, inputData, userId).catch(err => {
    logger.error(`Agent ${agent.id} execution ${execution.id} failed: %s`, err.message);
  });

  return execution;
}

async function processExecution(agent, execution, inputData, userId) {
  await acquireSlot();
  const startTime = Date.now();

  try {
    await agentModel.updateExecution(execution.id, { status: 'processing' });

    const result = await callClaudeAPI({
      prompt: typeof inputData === 'string' ? inputData : JSON.stringify(inputData),
      systemPrompt: agent.system_prompt,
      model: agent.model,
      temperature: parseFloat(agent.temperature),
      maxTokens: agent.max_tokens,
    });

    const durationMs = Date.now() - startTime;

    await agentModel.updateExecution(execution.id, {
      status: 'completed',
      output_data: result.output,
      tokens_input: result.tokensInput,
      tokens_output: result.tokensOutput,
      completed_at: new Date(),
      duration_ms: durationMs,
    });

    // Update agent stats
    await agentModel.update(agent.id, {
      total_tasks: agent.total_tasks + 1,
      total_tokens_used: (parseInt(agent.total_tokens_used) || 0) + result.tokensInput + result.tokensOutput,
    });

    // Increment monthly usage counter
    try {
      await query('UPDATE users SET monthly_agent_tasks = COALESCE(monthly_agent_tasks, 0) + 1 WHERE id = $1', [userId]);
    } catch (e) { logger.error('[UsageCounter] agent increment failed: %s', e.message); }

    // Log
    await query(
      `INSERT INTO execution_logs (user_id, agent_execution_id, level, message, metadata) VALUES ($1, $2, $3, $4, $5)`,
      [userId, execution.id, 'info', `Agent "${agent.name}" completed in ${durationMs}ms`,
       JSON.stringify({ tokensInput: result.tokensInput, tokensOutput: result.tokensOutput })]
    );

    // Notification
    await query(
      `INSERT INTO notifications (user_id, type, title, message, icon, link_page) VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, 'agent', 'Agent Task Complete', `"${agent.name}" finished processing`, 'cpu', 'agents']
    );

  } catch (err) {
    const durationMs = Date.now() - startTime;

    await agentModel.updateExecution(execution.id, {
      status: 'failed',
      error_message: err.message,
      completed_at: new Date(),
      duration_ms: durationMs,
    });

    await query(
      `INSERT INTO execution_logs (user_id, agent_execution_id, level, message, metadata) VALUES ($1, $2, $3, $4, $5)`,
      [userId, execution.id, 'error', `Agent "${agent.name}" failed: ${err.message}`, '{}']
    );

    await query(
      `INSERT INTO notifications (user_id, type, title, message, icon, link_page) VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, 'agent', 'Agent Task Failed', `"${agent.name}" failed: ${err.message}`, 'alert-triangle', 'agents']
    );

  } finally {
    releaseSlot();
  }
}

async function callClaudeAPI({ prompt, systemPrompt, model, temperature, maxTokens }) {
  if (!env.anthropicApiKey) {
    throw new Error('AI service unavailable: Anthropic API key not configured. Set ANTHROPIC_API_KEY in environment variables.');
  }

  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: env.anthropicApiKey });

  const response = await client.messages.create({
    model: model || 'claude-sonnet-4-20250514',
    max_tokens: maxTokens || 4096,
    temperature: temperature ?? 0.3,
    ...(systemPrompt ? { system: systemPrompt } : {}),
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content
    .filter(c => c.type === 'text')
    .map(c => c.text)
    .join('\n');

  return {
    output: { text, model: response.model, stopReason: response.stop_reason },
    tokensInput: response.usage.input_tokens,
    tokensOutput: response.usage.output_tokens,
  };
}

/**
 * Direct prompt execution (used by workflow engine AI nodes)
 */
async function executePrompt({ prompt, systemPrompt, model, maxTokens, temperature }) {
  const result = await callClaudeAPI({ prompt, systemPrompt, model, maxTokens, temperature });
  return {
    ...result.output,
    tokensInput: result.tokensInput,
    tokensOutput: result.tokensOutput,
    model: model || 'claude-sonnet-4-20250514',
  };
}

/**
 * Enhance a user's brief prompt into a comprehensive system prompt
 */
async function enhancePrompt(userIntent) {
  const result = await callClaudeAPI({
    prompt: userIntent,
    systemPrompt: `You are a prompt engineering expert. The user will give you a brief description of what they want an AI agent to do. Rewrite this into a comprehensive, well-structured system prompt that:

1. Clearly defines the agent's role and expertise
2. Specifies how to handle inputs and format outputs
3. Includes edge case handling and error behavior
4. Maintains the user's original intent completely
5. Adds helpful constraints (tone, length, format) where appropriate

Return ONLY the system prompt text — no explanation, no preamble, no markdown wrapping. The output should be ready to paste directly as a system prompt.`,
    model: 'claude-sonnet-4-20250514',
    maxTokens: 2048,
    temperature: 0.4,
  });
  return result.output?.text || result.output;
}

module.exports = { executeAgent, executePrompt, enhancePrompt };
