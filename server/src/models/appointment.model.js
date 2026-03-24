const { query, getClient } = require('../config/database');

const findByUser = async (userId, { limit, offset, status }) => {
  let sql = 'SELECT * FROM appointments WHERE user_id = $1';
  const params = [userId];
  let idx = 2;

  if (status) {
    sql += ` AND status = $${idx}`;
    params.push(status);
    idx++;
  }

  sql += ' ORDER BY date DESC, start_time DESC';
  sql += ` LIMIT $${idx} OFFSET $${idx + 1}`;
  params.push(limit, offset);

  const { rows } = await query(sql, params);
  return rows;
};

const countByUser = async (userId, status) => {
  let sql = 'SELECT COUNT(*)::int as count FROM appointments WHERE user_id = $1';
  const params = [userId];
  if (status) {
    sql += ' AND status = $2';
    params.push(status);
  }
  const { rows } = await query(sql, params);
  return rows[0].count;
};

const findById = async (id) => {
  const { rows } = await query('SELECT * FROM appointments WHERE id = $1', [id]);
  return rows[0] || null;
};

const findByDateRange = async (userId, date) => {
  const { rows } = await query(
    `SELECT * FROM appointments WHERE user_id = $1 AND date = $2 AND status = 'confirmed' ORDER BY start_time`,
    [userId, date]
  );
  return rows;
};

/**
 * Book with conflict detection using row-level locking.
 */
const bookWithLock = async ({ userId, bookerName, bookerEmail, bookerCompany, date, startTime, endTime, timezone, notes, meetingType, confirmationToken }) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Lock existing appointments for this date to prevent race conditions
    const { rows: conflicts } = await client.query(
      `SELECT id FROM appointments
       WHERE user_id = $1 AND date = $2 AND status = 'confirmed'
         AND start_time < $4 AND end_time > $3
       FOR UPDATE`,
      [userId, date, startTime, endTime]
    );

    if (conflicts.length > 0) {
      await client.query('ROLLBACK');
      return null; // Slot taken
    }

    const { rows } = await client.query(
      `INSERT INTO appointments (user_id, booker_name, booker_email, booker_company, date, start_time, end_time, timezone, notes, meeting_type, confirmation_token)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [userId, bookerName, bookerEmail, bookerCompany || null, date, startTime, endTime, timezone || 'America/Los_Angeles', notes || null, meetingType || 'consultation', confirmationToken]
    );

    await client.query('COMMIT');
    return rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
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
    `UPDATE appointments SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
    values
  );
  return rows[0];
};

// Availability rules
const getAvailabilityRules = async (userId) => {
  const { rows } = await query(
    'SELECT * FROM availability_rules WHERE user_id = $1 ORDER BY day_of_week',
    [userId]
  );
  return rows;
};

const upsertAvailabilityRule = async (userId, dayOfWeek, startTime, endTime, isActive) => {
  const { rows } = await query(
    `INSERT INTO availability_rules (user_id, day_of_week, start_time, end_time, is_active)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, day_of_week) DO UPDATE SET start_time = $3, end_time = $4, is_active = $5
     RETURNING *`,
    [userId, dayOfWeek, startTime, endTime, isActive]
  );
  return rows[0];
};

const getBlockedDates = async (userId) => {
  const { rows } = await query(
    'SELECT * FROM blocked_dates WHERE user_id = $1 ORDER BY blocked_date',
    [userId]
  );
  return rows;
};

const isDateBlocked = async (userId, date) => {
  const { rows } = await query(
    'SELECT id FROM blocked_dates WHERE user_id = $1 AND blocked_date = $2',
    [userId, date]
  );
  return rows.length > 0;
};

module.exports = {
  findByUser, countByUser, findById, findByDateRange, bookWithLock, update,
  getAvailabilityRules, upsertAvailabilityRule, getBlockedDates, isDateBlocked,
};
