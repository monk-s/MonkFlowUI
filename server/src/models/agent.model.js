const { query } = require('../config/database');

const findByUser = async (userId, { limit, offset }) => {
  const { rows } = await query(
    'SELECT * FROM agents WHERE user_id = $1 ORDER BY updated_at DESC LIMIT $2 OFFSET $3',
    [userId, limit, offset]
  );
  return rows;
};

const countByUser = async (userId) => {
  const { rows } = await query('SELECT COUNT(*)::int as count FROM agents WHERE user_id = $1', [userId]);
  return rows[0].count;
};

const findById = async (id) => {
  const { rows } = await query('SELECT * FROM agents WHERE id = $1', [id]);
  return rows[0] || null;
};

const create = async (data) => {
  const { rows } = await query(
    `INSERT INTO agents (user_id, name, description, icon, agent_type, model, system_prompt, temperature, max_tokens)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [data.userId, data.name, data.description || null, data.icon || null,
     data.agentType, data.model || 'claude-sonnet-4-20250514', data.systemPrompt || null,
     data.temperature ?? 0.3, data.maxTokens || 4096]
  );
  return rows[0];
};

const update = async (id, fields) => {
  const sets = [];
  const values = [];
  let idx = 1;
  for (const [key, val] of Object.entries(fields)) {
    sets.push(`${key} = $${idx}`);
    values.push(val);
    idx++;
  }
  sets.push('updated_at = NOW()');
  values.push(id);
  const { rows } = await query(
    `UPDATE agents SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
    values
  );
  return rows[0];
};

const deleteById = async (id) => {
  await query('DELETE FROM agents WHERE id = $1', [id]);
};

const createExecution = async (data) => {
  const { rows } = await query(
    `INSERT INTO agent_executions (agent_id, input_data, status) VALUES ($1, $2, $3) RETURNING *`,
    [data.agentId, JSON.stringify(data.inputData), 'queued']
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
    `UPDATE agent_executions SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
    values
  );
  return rows[0];
};

const findExecutionsByAgent = async (agentId, limit = 20, offset = 0) => {
  const { rows } = await query(
    'SELECT * FROM agent_executions WHERE agent_id = $1 ORDER BY started_at DESC LIMIT $2 OFFSET $3',
    [agentId, limit, offset]
  );
  return rows;
};

module.exports = {
  findByUser, countByUser, findById, create, update, deleteById,
  createExecution, updateExecution, findExecutionsByAgent,
};
