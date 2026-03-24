const { query } = require('../config/database');

const findByEmail = async (email) => {
  const { rows } = await query('SELECT * FROM users WHERE email = $1', [email]);
  return rows[0] || null;
};

const findById = async (id) => {
  const { rows } = await query('SELECT * FROM users WHERE id = $1', [id]);
  return rows[0] || null;
};

const create = async ({ email, passwordHash, firstName, lastName, company }) => {
  const { rows } = await query(
    `INSERT INTO users (email, password_hash, first_name, last_name, company)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [email, passwordHash, firstName, lastName, company || null]
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
  sets.push(`updated_at = NOW()`);
  values.push(id);

  const { rows } = await query(
    `UPDATE users SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
    values
  );
  return rows[0];
};

const deleteById = async (id) => {
  await query('DELETE FROM users WHERE id = $1', [id]);
};

const findByResetToken = async (tokenHash) => {
  const { rows } = await query(
    `SELECT * FROM users WHERE password_reset_token = $1 AND password_reset_expires > NOW()`,
    [tokenHash]
  );
  return rows[0] || null;
};

// Strip sensitive fields for API responses
const sanitize = (user) => {
  if (!user) return null;
  const { password_hash, password_reset_token, password_reset_expires, ...safe } = user;
  return safe;
};

module.exports = { findByEmail, findById, create, update, deleteById, findByResetToken, sanitize };
