const { Parser } = require('expr-eval');
const workflowModel = require('../models/workflow.model');
const { query } = require('../config/database');

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
        output = await executeNode(node, context);
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
    } catch (e) { console.error('[UsageCounter] workflow increment failed:', e.message); }

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

    // Create failure notification
    await createNotification(workflow.user_id, 'workflow', 'Workflow Failed',
      `"${workflow.name}" failed: ${err.message}`, 'alert-triangle', 'workflows');

    return { status: 'failed', executionId: execution.id, error: err.message, nodeResults, durationMs };
  }
}

async function executeNode(node, context) {
  const config = node.config || {};

  switch (node.type) {
    case 'trigger':
    case 'webhook':
    case 'schedule':
    case 'manual':
      return context.data;

    case 'ai':
    case 'ai_process': {
      // Use the agent executor for AI nodes
      const agentExecutor = require('./agent.executor');
      const prompt = interpolateTemplate(config.prompt || 'Process this data', context);
      const result = await agentExecutor.executePrompt({
        prompt,
        model: config.model || 'claude-sonnet-4-20250514',
        maxTokens: config.maxTokens || 2048,
        temperature: config.temperature || 0.3,
      });
      return result;
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
      } catch {
        return true;
      }
    }

    case 'action':
    case 'email': {
      // Simulate action — in production this would call external APIs
      return { action: config.actionType || 'generic', executed: true, timestamp: new Date().toISOString() };
    }

    case 'delay': {
      const ms = (config.seconds || 1) * 1000;
      await new Promise(resolve => setTimeout(resolve, Math.min(ms, 30000))); // Cap at 30s
      return { delayed: true, ms };
    }

    case 'transform': {
      // Simple data transformation using template
      const template = config.template || '{{data}}';
      return interpolateTemplate(template, context);
    }

    case 'api_call': {
      // HTTP call to external API
      const url = interpolateTemplate(config.url || '', context);
      const method = (config.method || 'GET').toUpperCase();
      const headers = config.headers || {};
      const body = config.body ? interpolateTemplate(config.body, context) : undefined;

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...headers },
        ...(body && method !== 'GET' ? { body } : {}),
      });
      return { status: response.status, data: await response.json().catch(() => null) };
    }

    case 'notification': {
      const message = interpolateTemplate(config.message || 'Workflow notification', context);
      // This would create an in-app notification
      return { notified: true, message };
    }

    default:
      return { type: node.type, passthrough: true };
  }
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
