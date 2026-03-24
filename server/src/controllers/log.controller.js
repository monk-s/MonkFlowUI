const catchAsync = require('../utils/catchAsync');
const { query } = require('../config/database');
const { paginate, paginatedResponse } = require('../utils/pagination');

const list = catchAsync(async (req, res) => {
  const { page, limit, offset } = paginate(req.query);
  const { level, search } = req.query;

  let sql = 'SELECT * FROM execution_logs WHERE user_id = $1';
  let countSql = 'SELECT COUNT(*)::int as count FROM execution_logs WHERE user_id = $1';
  const params = [req.user.userId];
  const countParams = [req.user.userId];
  let idx = 2;

  if (level) {
    sql += ` AND level = $${idx}`;
    countSql += ` AND level = $${idx}`;
    params.push(level);
    countParams.push(level);
    idx++;
  }

  if (search) {
    sql += ` AND message ILIKE $${idx}`;
    countSql += ` AND message ILIKE $${idx}`;
    params.push(`%${search}%`);
    countParams.push(`%${search}%`);
    idx++;
  }

  sql += ' ORDER BY created_at DESC';
  sql += ` LIMIT $${idx} OFFSET $${idx + 1}`;
  params.push(limit, offset);

  const [{ rows }, { rows: countRows }] = await Promise.all([
    query(sql, params),
    query(countSql, countParams),
  ]);

  res.json(paginatedResponse(rows, countRows[0].count, { page, limit }));
});

module.exports = { list };
