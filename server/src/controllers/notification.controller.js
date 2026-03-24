const catchAsync = require('../utils/catchAsync');
const { query } = require('../config/database');
const { paginate } = require('../utils/pagination');

const list = catchAsync(async (req, res) => {
  const { limit, offset } = paginate(req.query);
  const readFilter = req.query.read;

  let sql = 'SELECT * FROM notifications WHERE user_id = $1';
  const params = [req.user.userId];
  let idx = 2;

  if (readFilter !== undefined) {
    sql += ` AND read = $${idx}`;
    params.push(readFilter === 'true');
    idx++;
  }

  sql += ' ORDER BY created_at DESC';
  sql += ` LIMIT $${idx} OFFSET $${idx + 1}`;
  params.push(limit, offset);

  const { rows } = await query(sql, params);

  // Get unread count
  const { rows: countRows } = await query(
    'SELECT COUNT(*)::int as count FROM notifications WHERE user_id = $1 AND read = FALSE',
    [req.user.userId]
  );

  res.json({ data: rows, unreadCount: countRows[0].count });
});

const markRead = catchAsync(async (req, res) => {
  await query(
    'UPDATE notifications SET read = TRUE WHERE id = $1 AND user_id = $2',
    [req.params.id, req.user.userId]
  );
  res.json({ message: 'Notification marked as read' });
});

const markAllRead = catchAsync(async (req, res) => {
  await query(
    'UPDATE notifications SET read = TRUE WHERE user_id = $1 AND read = FALSE',
    [req.user.userId]
  );
  res.json({ message: 'All notifications marked as read' });
});

module.exports = { list, markRead, markAllRead };
