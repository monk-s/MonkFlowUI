const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const { query } = require('../config/database');
const { generateToken } = require('../utils/crypto');

const listMembers = catchAsync(async (req, res) => {
  const { rows } = await query(
    `SELECT tm.*, u.first_name, u.last_name, u.avatar_url
     FROM team_members tm
     LEFT JOIN users u ON tm.user_id = u.id
     WHERE tm.team_owner_id = $1
     ORDER BY tm.invited_at DESC`,
    [req.user.userId]
  );
  res.json({ data: rows });
});

const invite = catchAsync(async (req, res) => {
  const { email, name, role } = req.body;
  if (!email) throw ApiError.badRequest('Email is required');

  const inviteToken = generateToken(24);

  const { rows } = await query(
    `INSERT INTO team_members (team_owner_id, email, name, role, invite_token)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [req.user.userId, email, name || null, role || 'viewer', inviteToken]
  );

  // Send invite email
  try {
    const emailService = require('../services/email.service');
    await emailService.sendTeamInvite(email, name, inviteToken);
  } catch (err) {
    console.error('Failed to send team invite:', err.message);
  }

  res.status(201).json({ data: rows[0] });
});

const updateMember = catchAsync(async (req, res) => {
  const { role, status } = req.body;
  const fields = [];
  const values = [];
  let idx = 1;

  if (role) { fields.push(`role = $${idx}`); values.push(role); idx++; }
  if (status) { fields.push(`status = $${idx}`); values.push(status); idx++; }

  if (fields.length === 0) throw ApiError.badRequest('No fields to update');

  values.push(req.params.id, req.user.userId);
  const { rows } = await query(
    `UPDATE team_members SET ${fields.join(', ')} WHERE id = $${idx} AND team_owner_id = $${idx + 1} RETURNING *`,
    values
  );

  if (rows.length === 0) throw ApiError.notFound('Team member not found');
  res.json({ data: rows[0] });
});

const removeMember = catchAsync(async (req, res) => {
  const { rowCount } = await query(
    'DELETE FROM team_members WHERE id = $1 AND team_owner_id = $2',
    [req.params.id, req.user.userId]
  );
  if (rowCount === 0) throw ApiError.notFound('Team member not found');
  res.json({ message: 'Team member removed' });
});

module.exports = { listMembers, invite, updateMember, removeMember };
