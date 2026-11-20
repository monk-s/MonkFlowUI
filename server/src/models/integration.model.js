const { query } = require('../config/database');
const secretBox = require('../utils/secretBox');

// Credentials are stored sealed (AES-256-GCM, bound to the owning user) as
// { _sealed: <base64> }. Rows written before this, and rows written where no
// DOCUMENT_KEY is set (local development, tests), are plain JSON and still read.
const aad = (userId) => `integration:${userId}`;
function pack(config, userId) {
  if (!secretBox.configured() || !config || !Object.keys(config).length) return config || {};
  return { _sealed: secretBox.seal(Buffer.from(JSON.stringify(config)), aad(userId)).toString('base64') };
}
function unpack(row) {
  if (!row || !row.config || typeof row.config._sealed !== 'string') return row;
  return { ...row, config: JSON.parse(secretBox.open(Buffer.from(row.config._sealed, 'base64'), aad(row.user_id)).toString()) };
}

async function findByUser(userId) {
  const { rows } = await query(
    'SELECT * FROM user_integrations WHERE user_id = $1 ORDER BY provider',
    [userId]
  );
  return rows.map(unpack);
}

async function findByUserAndProvider(userId, provider) {
  const { rows } = await query(
    'SELECT * FROM user_integrations WHERE user_id = $1 AND provider = $2',
    [userId, provider]
  );
  return unpack(rows[0]) || null;
}

async function upsert(userId, provider, config, status = 'connected') {
  const { rows } = await query(
    `INSERT INTO user_integrations (user_id, provider, config, status, connected_at, updated_at)
     VALUES ($1, $2, $3, $4, NOW(), NOW())
     ON CONFLICT (user_id, provider)
     DO UPDATE SET config = $3, status = $4, connected_at = NOW(), updated_at = NOW()
     RETURNING *`,
    [userId, provider, JSON.stringify(pack(config, userId)), status]
  );
  return unpack(rows[0]);
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
  pack,
};
