const { query } = require('../config/database');

const findConnection = async (userId) => {
  const { rows } = await query('SELECT * FROM qbo_connections WHERE user_id = $1', [userId]);
  return rows[0] || null;
};

const upsertConnection = async (userId, data) => {
  const { rows } = await query(
    `INSERT INTO qbo_connections (user_id, realm_id, access_token, refresh_token, token_expires_at, company_name)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id) DO UPDATE SET
       realm_id = EXCLUDED.realm_id,
       access_token = EXCLUDED.access_token,
       refresh_token = EXCLUDED.refresh_token,
       token_expires_at = EXCLUDED.token_expires_at,
       company_name = EXCLUDED.company_name,
       updated_at = NOW()
     RETURNING *`,
    [userId, data.realmId, data.accessToken, data.refreshToken, data.tokenExpiresAt, data.companyName || null]
  );
  return rows[0];
};

const updateTokens = async (userId, accessToken, refreshToken, expiresAt) => {
  const { rows } = await query(
    `UPDATE qbo_connections SET access_token = $2, refresh_token = $3, token_expires_at = $4, updated_at = NOW()
     WHERE user_id = $1 RETURNING *`,
    [userId, accessToken, refreshToken, expiresAt]
  );
  return rows[0];
};

const findCustomerMap = async (userId) => {
  const { rows } = await query('SELECT * FROM qbo_customer_map WHERE user_id = $1', [userId]);
  return rows[0] || null;
};

const upsertCustomerMap = async (userId, qboCustomerId, qboCustomerName) => {
  const { rows } = await query(
    `INSERT INTO qbo_customer_map (user_id, qbo_customer_id, qbo_customer_name)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE SET
       qbo_customer_id = EXCLUDED.qbo_customer_id,
       qbo_customer_name = EXCLUDED.qbo_customer_name,
       synced_at = NOW()
     RETURNING *`,
    [userId, qboCustomerId, qboCustomerName]
  );
  return rows[0];
};

module.exports = { findConnection, upsertConnection, updateTokens, findCustomerMap, upsertCustomerMap };
