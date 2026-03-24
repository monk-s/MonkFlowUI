const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const userModel = require('../models/user.model');
const authService = require('../services/auth.service');
const refreshTokenModel = require('../models/refreshToken.model');

const getMe = catchAsync(async (req, res) => {
  const user = await userModel.findById(req.user.userId);
  if (!user) throw ApiError.notFound('User not found');
  res.json({ user: userModel.sanitize(user) });
});

const updateMe = catchAsync(async (req, res) => {
  const { firstName, lastName, company, timezone, avatarUrl } = req.validated;
  const fields = {};
  if (firstName !== undefined) fields.first_name = firstName;
  if (lastName !== undefined) fields.last_name = lastName;
  if (company !== undefined) fields.company = company;
  if (timezone !== undefined) fields.timezone = timezone;
  if (avatarUrl !== undefined) fields.avatar_url = avatarUrl;

  if (Object.keys(fields).length === 0) {
    throw ApiError.badRequest('No fields to update');
  }

  const user = await userModel.update(req.user.userId, fields);
  res.json({ user: userModel.sanitize(user) });
});

const changePassword = catchAsync(async (req, res) => {
  const { currentPassword, newPassword } = req.validated;
  const user = await userModel.findById(req.user.userId);

  const valid = await authService.comparePassword(currentPassword, user.password_hash);
  if (!valid) throw ApiError.unauthorized('Current password is incorrect');

  const hash = await authService.hashPassword(newPassword);
  await userModel.update(user.id, { password_hash: hash });

  // Revoke all refresh tokens (force re-login on other devices)
  await refreshTokenModel.revokeAllForUser(user.id);

  res.json({ message: 'Password changed successfully' });
});

const deleteMe = catchAsync(async (req, res) => {
  const { password } = req.validated;
  const user = await userModel.findById(req.user.userId);

  const valid = await authService.comparePassword(password, user.password_hash);
  if (!valid) throw ApiError.unauthorized('Password is incorrect');

  await userModel.deleteById(user.id);
  res.json({ message: 'Account deleted' });
});

module.exports = { getMe, updateMe, changePassword, deleteMe };
