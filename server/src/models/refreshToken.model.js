const { query } = require('../config/database');

const create = async (userId, tokenHash, expiresAt) => {
  const { rows } = await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3) RETURNING *`,
    [userId, tokenHash, expiresAt]
  );
  return rows[0];
};

const findByHash = async (tokenHash) => {
  const { rows } = await query(
    `SELECT * FROM refresh_tokens WHERE token_hash = $1 AND revoked = FALSE AND expires_at > NOW()`,
    [tokenHash]
  );
  return rows[0] || null;
};

const revoke = async (tokenHash) => {
  await query('UPDATE refresh_tokens SET revoked = TRUE WHERE token_hash = $1', [tokenHash]);
};

const revokeAllForUser = async (userId) => {
  await query('UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1', [userId]);
};

module.exports = { create, findByHash, revoke, revokeAllForUser };
