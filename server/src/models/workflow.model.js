const { query } = require('../config/database');

const findByUser = async (userId, { status, limit, offset }) => {
  let sql = 'SELECT * FROM workflows WHERE user_id = $1';
  const params = [userId];
  let idx = 2;

  if (status) {
    sql += ` AND status = $${idx}`;
    params.push(status);
    idx++;
  }

  sql += ' ORDER BY updated_at DESC';
  sql += ` LIMIT $${idx} OFFSET $${idx + 1}`;
  params.push(limit, offset);

  const { rows } = await query(sql, params);
  return rows;
};

const countByUser = async (userId, status) => {
  let sql = 'SELECT COUNT(*)::int as count FROM workflows WHERE user_id = $1';
  const params = [userId];
  if (status) {
    sql += ' AND status = $2';
    params.push(status);
  }
  const { rows } = await query(sql, params);
  return rows[0].count;
};

const findById = async (id) => {
  const { rows } = await query('SELECT * FROM workflows WHERE id = $1', [id]);
  return rows[0] || null;
};

const findByWebhookId = async (webhookId) => {
  const { rows } = await query('SELECT * FROM workflows WHERE webhook_id = $1', [webhookId]);
  return rows[0] || null;
};

const create = async (data) => {
  const { rows } = await query(
    `INSERT INTO workflows (user_id, name, description, trigger_type, trigger_config, definition, webhook_secret, cron_expression)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [data.userId, data.name, data.description || null, data.triggerType,
     JSON.stringify(data.triggerConfig || {}), JSON.stringify(data.definition || { nodes: [], connections: [] }),
     data.webhookSecret || null, data.cronExpression || null]
  );
  return rows[0];
};

const update = async (id, fields) => {
  const sets = [];
  const values = [];
  let idx = 1;

  for (const [key, val] of Object.entries(fields)) {
    sets.push(`${key} = $${idx}`);
    values.push(key === 'definition' || key === 'trigger_config' ? JSON.stringify(val) : val);
    idx++;
  }
  sets.push('updated_at = NOW()');
  values.push(id);

  const { rows } = await query(
    `UPDATE workflows SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
    values
  );
  return rows[0];
};

const deleteById = async (id) => {
  await query('DELETE FROM workflows WHERE id = $1', [id]);
};

const findActiveScheduled = async () => {
  const { rows } = await query(
    `SELECT * FROM workflows WHERE status = 'active' AND trigger_type = 'schedule' AND cron_expression IS NOT NULL`
  );
  return rows;
};

// Execution records
const createExecution = async (data) => {
  const { rows } = await query(
    `INSERT INTO workflow_executions (workflow_id, trigger_type, trigger_payload, status)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [data.workflowId, data.triggerType, JSON.stringify(data.triggerPayload || {}), 'running']
  );
  return rows[0];
};

const updateExecution = async (id, fields) => {
  const sets = [];
  const values = [];
  let idx = 1;

  for (const [key, val] of Object.entries(fields)) {
    sets.push(`${key} = $${idx}`);
    values.push(typeof val === 'object' && val !== null ? JSON.stringify(val) : val);
    idx++;
  }
  values.push(id);

  const { rows } = await query(
    `UPDATE workflow_executions SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
    values
  );
  return rows[0];
};

const findExecutionsByWorkflow = async (workflowId, limit = 20, offset = 0) => {
  const { rows } = await query(
    'SELECT * FROM workflow_executions WHERE workflow_id = $1 ORDER BY started_at DESC LIMIT $2 OFFSET $3',
    [workflowId, limit, offset]
  );
  return rows;
};

module.exports = {
  findByUser, countByUser, findById, findByWebhookId,
  create, update, deleteById, findActiveScheduled,
  createExecution, updateExecution, findExecutionsByWorkflow,
};
