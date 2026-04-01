const { query } = require('../config/database');

const findByUser = async (userId, limit = 20, offset = 0) => {
  const { rows } = await query(
    'SELECT * FROM invoices WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
    [userId, limit, offset]
  );
  return rows;
};

const countByUser = async (userId) => {
  const { rows } = await query('SELECT COUNT(*)::int as total FROM invoices WHERE user_id = $1', [userId]);
  return rows[0].total;
};

const findById = async (id) => {
  const { rows } = await query('SELECT * FROM invoices WHERE id = $1', [id]);
  return rows[0] || null;
};

const create = async (data) => {
  const { rows } = await query(
    `INSERT INTO invoices (user_id, qbo_invoice_id, period_start, period_end, plan_slug, plan_amount_cents, overage_amount_cents, total_amount_cents, line_items, status, qbo_synced)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [data.userId, data.qboInvoiceId || null, data.periodStart, data.periodEnd, data.planSlug || null,
     data.planAmountCents || 0, data.overageAmountCents || 0, data.totalAmountCents || 0,
     JSON.stringify(data.lineItems || []), data.status || 'draft', data.qboSynced || false]
  );
  return rows[0];
};

const update = async (id, fields) => {
  const allowed = ['qbo_invoice_id', 'status', 'qbo_synced', 'sent_at', 'paid_at', 'line_items', 'total_amount_cents'];
  const sets = [];
  const values = [];
  let idx = 1;
  for (const [key, val] of Object.entries(fields)) {
    if (allowed.includes(key)) {
      sets.push(`${key} = $${idx}`);
      values.push(key === 'line_items' ? JSON.stringify(val) : val);
      idx++;
    }
  }
  if (sets.length === 0) return findById(id);
  values.push(id);
  const { rows } = await query(
    `UPDATE invoices SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
    values
  );
  return rows[0];
};

const findAll = async (limit = 50, offset = 0) => {
  const { rows } = await query(
    'SELECT i.*, u.email, u.first_name, u.last_name FROM invoices i JOIN users u ON i.user_id = u.id ORDER BY i.created_at DESC LIMIT $1 OFFSET $2',
    [limit, offset]
  );
  return rows;
};

module.exports = { findByUser, countByUser, findById, create, update, findAll };
