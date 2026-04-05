const { query } = require('../config/database');

const findById = async (id) => {
  const { rows } = await query('SELECT * FROM leads WHERE id = $1', [id]);
  return rows[0] || null;
};

const findByEmail = async (email) => {
  const { rows } = await query('SELECT * FROM leads WHERE email = $1', [email]);
  return rows[0] || null;
};

const emailExists = async (email) => {
  const { rows } = await query('SELECT 1 FROM leads WHERE email = $1', [email]);
  return rows.length > 0;
};

const insert = async (data) => {
  const { rows } = await query(
    `INSERT INTO leads (business_name, business_type, city, state, website_url, facebook_url, email, phone,
       has_ssl, has_booking_software, booking_software_name, has_client_portal, has_intake_forms,
       design_age_estimate, diagnosis_json, outreach_subject, outreach_body, status, priority, batch_date, search_query, lead_score)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
     ON CONFLICT (email) DO NOTHING RETURNING *`,
    [data.business_name, data.business_type, data.city, data.state, data.website_url, data.facebook_url,
     data.email, data.phone, data.has_ssl, data.has_booking_software, data.booking_software_name,
     data.has_client_portal, data.has_intake_forms, data.design_age_estimate,
     JSON.stringify(data.diagnosis_json || {}), data.outreach_subject, data.outreach_body,
     data.status || 'discovered', data.priority || 'MEDIUM', data.batch_date || new Date(), data.search_query,
     data.lead_score || 0]
  );
  return rows[0] || null;
};

const update = async (id, fields) => {
  const keys = Object.keys(fields);
  const sets = keys.map((k, i) => `${k} = $${i + 2}`);
  sets.push('updated_at = NOW()');
  const vals = keys.map(k => k === 'diagnosis_json' ? JSON.stringify(fields[k]) : fields[k]);
  const { rows } = await query(
    `UPDATE leads SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
    [id, ...vals]
  );
  return rows[0] || null;
};

const findByBatchDate = async (date) => {
  const { rows } = await query('SELECT * FROM leads WHERE batch_date = $1 ORDER BY created_at', [date]);
  return rows;
};

const findAll = async ({ limit = 50, offset = 0, status, startDate, endDate } = {}) => {
  let sql = 'SELECT * FROM leads WHERE 1=1';
  const params = [];
  let idx = 1;

  if (status) { sql += ` AND status = $${idx}`; params.push(status); idx++; }
  if (startDate) { sql += ` AND batch_date >= $${idx}`; params.push(startDate); idx++; }
  if (endDate) { sql += ` AND batch_date <= $${idx}`; params.push(endDate); idx++; }

  sql += ` ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`;
  params.push(limit, offset);

  const { rows } = await query(sql, params);
  return rows;
};

const getStats = async () => {
  const { rows } = await query(`
    SELECT status, COUNT(*)::int as count FROM leads GROUP BY status
    UNION ALL
    SELECT 'total', COUNT(*)::int FROM leads
  `);
  return Object.fromEntries(rows.map(r => [r.status, r.count]));
};

const findByUnsubscribeToken = async (token) => {
  const { rows } = await query('SELECT * FROM leads WHERE unsubscribe_token = $1', [token]);
  return rows[0] || null;
};

module.exports = { findById, findByEmail, emailExists, insert, update, findByBatchDate, findAll, getStats, findByUnsubscribeToken };
