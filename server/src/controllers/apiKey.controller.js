const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const { query } = require('../config/database');
const { generateApiKey, hashToken } = require('../utils/crypto');

const list = catchAsync(async (req, res) => {
  const { rows } = await query(
    'SELECT id, name, key_prefix, last_used_at, created_at FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC',
    [req.user.userId]
  );
  res.json({ data: rows });
});

const create = catchAsync(async (req, res) => {
  const { name } = req.body;
  if (!name) throw ApiError.badRequest('Name is required');

  const { prefix, key, secret } = generateApiKey();
  const keyHash = hashToken(secret);

  const { rows } = await query(
    'INSERT INTO api_keys (user_id, name, key_prefix, key_hash) VALUES ($1, $2, $3, $4) RETURNING id, name, key_prefix, created_at',
    [req.user.userId, name, prefix, keyHash]
  );

  // Return the full key only on creation — it can never be retrieved again
  res.status(201).json({ data: { ...rows[0], key } });
});

const remove = catchAsync(async (req, res) => {
  const { rowCount } = await query(
    'DELETE FROM api_keys WHERE id = $1 AND user_id = $2',
    [req.params.id, req.user.userId]
  );
  if (rowCount === 0) throw ApiError.notFound('API key not found');
  res.json({ message: 'API key deleted' });
});

module.exports = { list, create, remove };
