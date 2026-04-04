const { Parser } = require('expr-eval');
const workflowModel = require('../models/workflow.model');
const { query } = require('../config/database');
const logger = require('../utils/logger');

const parser = new Parser();

/**
 * Execute a workflow given its definition and trigger payload.
 * Returns { status, result, nodeResults, error }
 */
async function executeWorkflow(workflow, triggerPayload = {}) {
  const execution = await workflowModel.createExecution({
    workflowId: workflow.id,
    triggerType: workflow.trigger_type,
    triggerPayload,
  });

  const startTime = Date.now();
  const definition = workflow.definition;
  const nodes = definition.nodes || [];
  const connections = definition.connections || [];
  const nodeResults = [];
  const context = { data: triggerPayload, results: {} };

  try {
    // Build adjacency list
    const adjacency = {};
    const nodeMap = {};
    for (const node of nodes) {
      nodeMap[node.id] = node;
      adjacency[node.id] = [];
    }
    for (const conn of connections) {
      if (adjacency[conn.from]) {
        adjacency[conn.from].push(conn.to);
      }
    }

    // Find trigger/start node (first node with no incoming connections)
    const hasIncoming = new Set(connections.map(c => c.to));
    let startNode = nodes.find(n => !hasIncoming.has(n.id));
    if (!startNode && nodes.length > 0) startNode = nodes[0];

    if (!startNode) {
      throw new Error('No start node found in workflow');
    }

    // BFS execution
    const visited = new Set();
    const queue = [startNode.id];

    while (queue.length > 0) {
      const nodeId = queue.shift();
      if (visited.has(nodeId)) continue;
      visited.add(nodeId);

      const node = nodeMap[nodeId];
      if (!node) continue;

      const nodeStart = Date.now();
      let output = null;

      try {
        output = await executeNode(node, context, workflow.user_id);
        context.results[nodeId] = output;

        nodeResults.push({
          nodeId: node.id,
          nodeType: node.type,
          label: node.label,
          status: 'completed',
          output,
          durationMs: Date.now() - nodeStart,
        });

        // Log node execution
        await logExecution(workflow.user_id, execution.id, null, 'info',
          `Node "${node.label}" completed`, { nodeId, output });

      } catch (nodeErr) {
        nodeResults.push({
          nodeId: node.id,
          nodeType: node.type,
          label: node.label,
          status: 'failed',
          error: nodeErr.message,
          durationMs: Date.now() - nodeStart,
        });

        await logExecution(workflow.user_id, execution.id, null, 'error',
          `Node "${node.label}" failed: ${nodeErr.message}`, { nodeId });

        throw nodeErr;
      }

      // Handle condition nodes — route based on output
      if (node.type === 'condition' && output !== null) {
        const nextNodes = adjacency[nodeId] || [];
        // Convention: first connection = true branch, second = false branch
        if (output === true && nextNodes[0]) queue.push(nextNodes[0]);
        else if (output === false && nextNodes[1]) queue.push(nextNodes[1]);
        else if (nextNodes[0]) queue.push(nextNodes[0]);
      } else {
        // Normal flow — add all children
        const nextNodes = adjacency[nodeId] || [];
        for (const next of nextNodes) {
          if (!visited.has(next)) queue.push(next);
        }
      }
    }

    const durationMs = Date.now() - startTime;

    // Update execution as completed
    await workflowModel.updateExecution(execution.id, {
      status: 'completed',
      result: { nodeResults },
      node_results: nodeResults,
      completed_at: new Date(),
      duration_ms: durationMs,
    });

    // Update workflow stats
    await updateWorkflowStats(workflow.id);

    // Increment monthly usage counter
    try {
      await query('UPDATE users SET monthly_workflow_runs = COALESCE(monthly_workflow_runs, 0) + 1 WHERE id = $1', [workflow.user_id]);
    } catch (e) { logger.error('[UsageCounter] workflow increment failed: %s', e.message); }

    return { status: 'completed', executionId: execution.id, nodeResults, durationMs };

  } catch (err) {
    const durationMs = Date.now() - startTime;

    await workflowModel.updateExecution(execution.id, {
      status: 'failed',
      error_message: err.message,
      node_results: nodeResults,
      completed_at: new Date(),
      duration_ms: durationMs,
    });

    await updateWorkflowStats(workflow.id);

    // Auto-set workflow to 'error' status if 3+ failures in 24h
    try {
      const { rows: failRows } = await query(
        `SELECT COUNT(*) as cnt FROM workflow_executions WHERE workflow_id = $1 AND status = 'failed' AND started_at > NOW() - INTERVAL '24 hours'`,
        [workflow.id]
      );
      if (parseInt(failRows[0]?.cnt) >= 3) {
        await query(`UPDATE workflows SET status = 'error', updated_at = NOW() WHERE id = $1`, [workflow.id]);
      }
    } catch (_) { /* don't block on status update failure */ }

    // Create failure notification
    await createNotification(workflow.user_id, 'workflow', 'Workflow Failed',
      `"${workflow.name}" failed: ${err.message}`, 'alert-triangle', 'workflows');

    return { status: 'failed', executionId: execution.id, error: err.message, nodeResults, durationMs };
  }
}

async function executeNode(node, context, workflowUserId) {
  const config = node.config || {};
  const label = node.label || node.type;

  switch (node.type) {
    case 'trigger':
    case 'webhook':
    case 'schedule':
    case 'manual':
      return context.data;

    case 'ai':
    case 'ai_process': {
      if (!config.prompt) {
        throw new Error(`AI node "${label}": No prompt configured. Open node settings and enter a prompt.`);
      }
      const agentExecutor = require('./agent.executor');
      const prompt = interpolateTemplate(config.prompt, context);
      try {
        const result = await agentExecutor.executePrompt({
          prompt,
          model: config.model || 'claude-sonnet-4-20250514',
          maxTokens: config.maxTokens || 2048,
          temperature: config.temperature || 0.3,
        });
        return result;
      } catch (err) {
        if (err.message.includes('401') || err.message.includes('authentication'))
          throw new Error(`AI node "${label}": Invalid API key. Check your Anthropic API key in Settings.`);
        if (err.message.includes('rate_limit') || err.message.includes('429'))
          throw new Error(`AI node "${label}": Rate limited by AI provider. Wait a moment and retry.`);
        throw new Error(`AI node "${label}" failed: ${err.message}`);
      }
    }

    case 'custom_agent': {
      if (!config.agentId) {
        throw new Error(`Agent node "${label}": No agent selected. Open node settings and choose an agent.`);
      }
      const agentModel = require('../models/agent.model');
      const agentExecutor = require('./agent.executor');
      const agent = await agentModel.findById(config.agentId);
      if (!agent) throw new Error(`Agent node "${label}": Agent not found (it may have been deleted).`);
      if (!agent.system_prompt) throw new Error(`Agent node "${label}": Agent "${agent.name}" has no system prompt configured.`);

      const input = config.prompt
        ? interpolateTemplate(config.prompt, context)
        : JSON.stringify(context.data);

      try {
        const result = await agentExecutor.executePrompt({
          prompt: input,
          systemPrompt: agent.system_prompt,
          model: agent.model || 'claude-sonnet-4-20250514',
          maxTokens: agent.max_tokens || 4096,
          temperature: parseFloat(agent.temperature) || 0.3,
        });
        return result;
      } catch (err) {
        throw new Error(`Agent node "${label}" (${agent.name}) failed: ${err.message}`);
      }
    }

    case 'condition': {
      const expression = config.expression || 'true';
      try {
        const expr = parser.parse(expression);
        const variables = {
          ...flattenContext(context),
          data: JSON.stringify(context.data),
        };
        return !!expr.evaluate(variables);
      } catch (err) {
        throw new Error(`Condition node "${label}": Expression '${expression}' could not be evaluated — ${err.message}. Check your condition syntax.`);
      }
    }

    case 'action':
    case 'email': {
      const actionType = config.actionType || 'generic';
      if (actionType === 'email') {
        const emailService = require('./email.service');
        const recipient = interpolateTemplate(config.recipient || config.to || '', context);
        const subject = interpolateTemplate(config.subject || 'Workflow Notification', context);
        const body = interpolateTemplate(config.body || config.message || '', context);
        if (!recipient) throw new Error(`Email node "${label}": No recipient email configured. Open node settings and enter a "To" address.`);
        if (!body) throw new Error(`Email node "${label}": No email body configured.`);
        try {
          const result = await emailService.sendEmail({ to: recipient, subject, html: `<div style="font-family:sans-serif;">${body}</div>` });
          return { action: 'email', executed: true, recipient, messageId: result?.data?.id || result?.id, timestamp: new Date().toISOString() };
        } catch (err) {
          throw new Error(`Email node "${label}": Failed to send to ${recipient} — ${err.message}`);
        }
      }
      if (actionType === 'webhook') {
        const url = interpolateTemplate(config.webhookUrl || config.url || '', context);
        if (!url) throw new Error(`Webhook action "${label}": No URL configured.`);
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(context.data),
        });
        return { action: 'webhook', executed: true, status: response.status, timestamp: new Date().toISOString() };
      }
      if (actionType === 'log') {
        const message = interpolateTemplate(config.message || JSON.stringify(context.data), context);
        logger.info({ nodeLabel: label }, `[WORKFLOW LOG] ${label}: ${message}`);
        return { action: 'log', executed: true, message, timestamp: new Date().toISOString() };
      }
      return { action: actionType, executed: true, timestamp: new Date().toISOString() };
    }

    case 'delay': {
      const seconds = config.seconds || 1;
      const ms = seconds * 1000;
      await new Promise(resolve => setTimeout(resolve, Math.min(ms, 30000)));
      return { delayed: true, seconds, ms: Math.min(ms, 30000) };
    }

    case 'loop': {
      const collectionPath = config.collection || 'data';
      const items = getNestedValue(context, collectionPath);
      if (!items) throw new Error(`Loop node "${label}": Path "${collectionPath}" not found in context.`);
      if (!Array.isArray(items)) throw new Error(`Loop node "${label}": "${collectionPath}" is not a list (got ${typeof items}). The loop node needs an array to iterate over.`);
      if (items.length === 0) return { items: [], count: 0, message: 'Empty collection — nothing to iterate' };
      return { items, count: items.length, currentItem: items[0] };
    }

    case 'transform': {
      const template = config.template || '{{data}}';
      return interpolateTemplate(template, context);
    }

    case 'database': {
      const dbQuery = config.query || config.sql || '';
      if (!dbQuery) throw new Error(`Database node "${label}": No SQL query configured. Open node settings and enter a query.`);
      const operation = (config.operation || 'query').toLowerCase();
      try {
        // Only allow SELECT for safety — prevent arbitrary mutations from workflow nodes
        const trimmed = dbQuery.trim().toUpperCase();
        if (operation === 'query' && !trimmed.startsWith('SELECT')) {
          throw new Error('Only SELECT queries are allowed in query mode. Use insert/update/delete operation types for write operations.');
        }
        // SAFE parameterization: convert {{placeholder}} tokens into $N positional params
        const { sql: safeSql, params: safeParams } = parameterizeQuery(dbQuery, context);
        const { rows } = await query(safeSql, safeParams);
        return { rows, rowCount: rows.length, operation };
      } catch (err) {
        if (err.message.includes('Only SELECT')) throw err;
        throw new Error(`Database node "${label}": Query failed — ${err.message}`);
      }
    }

    case 'api_call': {
      const url = interpolateTemplate(config.url || '', context);
      if (!url) throw new Error(`API Call node "${label}": No URL configured. Open node settings and enter a URL.`);
      const method = (config.method || 'GET').toUpperCase();
      const headers = config.headers || {};
      const body = config.body ? interpolateTemplate(config.body, context) : undefined;

      try {
        const response = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json', ...headers },
          ...(body && method !== 'GET' ? { body } : {}),
        });
        const data = await response.json().catch(() => null);
        if (response.status >= 400) {
          throw new Error(`HTTP ${response.status}: ${data?.message || data?.error || response.statusText}`);
        }
        return { status: response.status, data };
      } catch (err) {
        throw new Error(`API Call node "${label}": Request to ${url} failed — ${err.message}`);
      }
    }

    case 'notification': {
      const message = interpolateTemplate(config.message || 'Workflow notification', context);
      if (workflowUserId) {
        await createNotification(workflowUserId, 'workflow', label, message, 'bell', 'workflows');
      }
      return { notified: true, message };
    }

    case 'slack_send': {
      const integrationService = require('./integration.service');
      const integrationModel = require('../models/integration.model');
      const integration = await integrationModel.findByUserAndProvider(workflowUserId, 'slack');
      if (!integration || integration.status !== 'connected') {
        throw new Error(`Slack node "${label}": Slack is not connected. Go to Integrations and connect Slack first.`);
      }
      const channel = interpolateTemplate(config.channel || '', context);
      const text = interpolateTemplate(config.text || '', context);
      if (!channel) throw new Error(`Slack node "${label}": No channel specified. Open node settings and enter a channel (e.g., #general).`);
      if (!text) throw new Error(`Slack node "${label}": No message text specified.`);
      try {
        const result = await integrationService.executeAction('slack', 'send_message', integration.config, { channel, text });
        return { provider: 'slack', action: 'send_message', ...result };
      } catch (err) {
        throw new Error(`Slack node "${label}": ${err.message}`);
      }
    }

    case 'twilio_sms': {
      const integrationService = require('./integration.service');
      const integrationModel = require('../models/integration.model');
      const integration = await integrationModel.findByUserAndProvider(workflowUserId, 'twilio');
      if (!integration || integration.status !== 'connected') {
        throw new Error(`SMS node "${label}": Twilio is not connected. Go to Integrations and connect Twilio first.`);
      }
      const to = interpolateTemplate(config.to || '', context);
      const body = interpolateTemplate(config.body || '', context);
      if (!to) throw new Error(`SMS node "${label}": No phone number specified.`);
      if (!body) throw new Error(`SMS node "${label}": No message body specified.`);
      try {
        const result = await integrationService.executeAction('twilio', 'send_sms', integration.config, { to, body });
        return { provider: 'twilio', action: 'send_sms', ...result };
      } catch (err) {
        throw new Error(`SMS node "${label}": ${err.message}`);
      }
    }

    case 'github_issue': {
      const integrationService = require('./integration.service');
      const integrationModel = require('../models/integration.model');
      const integration = await integrationModel.findByUserAndProvider(workflowUserId, 'github');
      if (!integration || integration.status !== 'connected') {
        throw new Error(`GitHub node "${label}": GitHub is not connected. Go to Integrations and connect GitHub first.`);
      }
      const owner = interpolateTemplate(config.owner || '', context);
      const repo = interpolateTemplate(config.repo || '', context);
      const title = interpolateTemplate(config.title || '', context);
      const body = interpolateTemplate(config.body || '', context);
      if (!owner || !repo) throw new Error(`GitHub node "${label}": Repository owner and name are required.`);
      if (!title) throw new Error(`GitHub node "${label}": Issue title is required.`);
      try {
        const result = await integrationService.executeAction('github', 'create_issue', integration.config, { owner, repo, title, body });
        return { provider: 'github', action: 'create_issue', ...result };
      } catch (err) {
        throw new Error(`GitHub node "${label}": ${err.message}`);
      }
    }

    case 'stripe_invoice': {
      const integrationService = require('./integration.service');
      const integrationModel = require('../models/integration.model');
      const integration = await integrationModel.findByUserAndProvider(workflowUserId, 'stripe');
      if (!integration || integration.status !== 'connected') {
        throw new Error(`Stripe node "${label}": Stripe is not connected. Go to Integrations and connect Stripe first.`);
      }
      const customerId = interpolateTemplate(config.customerId || '', context);
      if (!customerId) throw new Error(`Stripe node "${label}": Customer ID is required.`);
      try {
        const result = await integrationService.executeAction('stripe', 'create_invoice', integration.config, {
          customerId,
          amount: config.amount || 0,
          description: interpolateTemplate(config.description || '', context),
        });
        return { provider: 'stripe', action: 'create_invoice', ...result };
      } catch (err) {
        throw new Error(`Stripe node "${label}": ${err.message}`);
      }
    }

    default:
      return { type: node.type, passthrough: true, message: `Unknown node type "${node.type}" — passed through` };
  }
}

function getNestedValue(obj, path) {
  const parts = path.split('.');
  let val = obj;
  for (const part of parts) {
    if (val && typeof val === 'object') val = val[part];
    else return undefined;
  }
  return val;
}

function interpolateTemplate(template, context) {
  return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (match, path) => {
    const parts = path.split('.');
    let val = context;
    for (const part of parts) {
      if (val && typeof val === 'object') val = val[part];
      else return match;
    }
    return typeof val === 'object' ? JSON.stringify(val) : String(val ?? '');
  });
}

/**
 * Safely convert {{placeholder}} tokens in a SQL string to $N positional parameters.
 * Returns { sql, params } ready for pg's parameterized query().
 * This prevents SQL injection by never interpolating values into the query string.
 */
function parameterizeQuery(sqlTemplate, context) {
  const params = [];
  let paramIndex = 1;
  const sql = sqlTemplate.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (match, path) => {
    const parts = path.split('.');
    let val = context;
    for (const part of parts) {
      if (val && typeof val === 'object') val = val[part];
      else { val = null; break; }
    }
    // Convert objects to JSON strings for the parameter
    const paramVal = (val && typeof val === 'object') ? JSON.stringify(val) : (val ?? null);
    params.push(paramVal);
    return `$${paramIndex++}`;
  });
  return { sql, params };
}

function flattenContext(context) {
  const flat = {};
  if (context.data && typeof context.data === 'object') {
    for (const [key, val] of Object.entries(context.data)) {
      flat[key] = typeof val === 'number' ? val : String(val ?? '');
    }
  }
  return flat;
}

async function updateWorkflowStats(workflowId) {
  await query(`
    UPDATE workflows SET
      total_runs = (SELECT COUNT(*) FROM workflow_executions WHERE workflow_id = $1),
      success_rate = COALESCE(
        (SELECT ROUND(COUNT(*) FILTER (WHERE status = 'completed')::decimal / NULLIF(COUNT(*), 0) * 100, 2)
         FROM workflow_executions WHERE workflow_id = $1), 0),
      last_run_at = NOW(),
      updated_at = NOW()
    WHERE id = $1
  `, [workflowId]);
}

async function logExecution(userId, wfExecId, agentExecId, level, message, metadata = {}) {
  await query(
    `INSERT INTO execution_logs (user_id, workflow_execution_id, agent_execution_id, level, message, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, wfExecId, agentExecId, level, message, JSON.stringify(metadata)]
  );
}

async function createNotification(userId, type, title, message, icon, linkPage) {
  await query(
    `INSERT INTO notifications (user_id, type, title, message, icon, link_page) VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, type, title, message, icon, linkPage]
  );
}

module.exports = { executeWorkflow };
