const { query } = require('../config/database');

const findAll = async () => {
  const { rows } = await query('SELECT * FROM plans WHERE is_active = true ORDER BY sort_order');
  return rows;
};

const findById = async (id) => {
  const { rows } = await query('SELECT * FROM plans WHERE id = $1', [id]);
  return rows[0] || null;
};

const findBySlug = async (slug) => {
  const { rows } = await query('SELECT * FROM plans WHERE slug = $1', [slug]);
  return rows[0] || null;
};

module.exports = { findAll, findById, findBySlug };
