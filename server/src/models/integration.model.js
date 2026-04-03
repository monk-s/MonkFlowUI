const { query } = require('../config/database');

async function findByUser(userId) {
  const { rows } = await query(
    'SELECT * FROM user_integrations WHERE user_id = $1 ORDER BY provider',
    [userId]
  );
  return rows;
}

async function findByUserAndProvider(userId, provider) {
  const { rows } = await query(
    'SELECT * FROM user_integrations WHERE user_id = $1 AND provider = $2',
    [userId, provider]
  );
  return rows[0] || null;
}

async function upsert(userId, provider, config, status = 'connected') {
  const { rows } = await query(
    `INSERT INTO user_integrations (user_id, provider, config, status, connected_at, updated_at)
     VALUES ($1, $2, $3, $4, NOW(), NOW())
     ON CONFLICT (user_id, provider)
     DO UPDATE SET config = $3, status = $4, connected_at = NOW(), updated_at = NOW()
     RETURNING *`,
    [userId, provider, JSON.stringify(config), status]
  );
  return rows[0];
}

async function updateStatus(userId, provider, status, lastError = null) {
  const { rows } = await query(
    `UPDATE user_integrations SET status = $3, last_error = $4, updated_at = NOW()
     WHERE user_id = $1 AND provider = $2 RETURNING *`,
    [userId, provider, status, lastError]
  );
  return rows[0];
}

async function disconnect(userId, provider) {
  const { rows } = await query(
    `UPDATE user_integrations SET status = 'disconnected', config = '{}', updated_at = NOW()
     WHERE user_id = $1 AND provider = $2 RETURNING *`,
    [userId, provider]
  );
  return rows[0];
}

async function deleteByUserAndProvider(userId, provider) {
  await query(
    'DELETE FROM user_integrations WHERE user_id = $1 AND provider = $2',
    [userId, provider]
  );
}

module.exports = {
  findByUser,
  findByUserAndProvider,
  upsert,
  updateStatus,
  disconnect,
  deleteByUserAndProvider,
};
