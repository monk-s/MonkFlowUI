const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const authService = require('../services/auth.service');
const userModel = require('../models/user.model');
const { hashToken } = require('../utils/crypto');

const signup = catchAsync(async (req, res) => {
  const { email, password, firstName, lastName, company } = req.validated;

  const existing = await userModel.findByEmail(email);
  if (existing) throw ApiError.conflict('Email already registered');

  const passwordHash = await authService.hashPassword(password);
  const user = await userModel.create({
    email,
    passwordHash,
    firstName,
    lastName,
    company,
  });

  const accessToken = authService.generateAccessToken(user);
  const refreshToken = await authService.generateRefreshToken(user.id);

  // Create default availability rules (Mon-Fri 9-5)
  const { query } = require('../config/database');
  for (let day = 1; day <= 5; day++) {
    await query(
      `INSERT INTO availability_rules (user_id, day_of_week, start_time, end_time) VALUES ($1, $2, $3, $4)`,
      [user.id, day, '09:00', '17:00']
    );
  }

  res.status(201).json({
    user: userModel.sanitize(user),
    accessToken,
    refreshToken,
  });
});

const login = catchAsync(async (req, res) => {
  const { email, password } = req.validated;

  const user = await userModel.findByEmail(email);
  if (!user) throw ApiError.unauthorized('Invalid email or password');

  const valid = await authService.comparePassword(password, user.password_hash);
  if (!valid) throw ApiError.unauthorized('Invalid email or password');

  const accessToken = authService.generateAccessToken(user);
  const refreshToken = await authService.generateRefreshToken(user.id);

  res.json({
    user: userModel.sanitize(user),
    accessToken,
    refreshToken,
  });
});

const refresh = catchAsync(async (req, res) => {
  const { refreshToken } = req.validated;
  const result = await authService.refreshAccessToken(refreshToken);
  if (!result) throw ApiError.unauthorized('Invalid or expired refresh token');
  res.json(result);
});

const logout = catchAsync(async (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) {
    await authService.revokeRefreshToken(refreshToken);
  }
  res.json({ message: 'Logged out successfully' });
});

const forgotPassword = catchAsync(async (req, res) => {
  const { email } = req.validated;
  const user = await userModel.findByEmail(email);

  // Always return success to prevent email enumeration
  if (user) {
    const resetToken = await authService.generatePasswordResetToken(user.id);
    // Send email (imported lazily to avoid circular deps)
    try {
      const emailService = require('../services/email.service');
      await emailService.sendPasswordReset(user.email, user.first_name, resetToken);
    } catch (err) {
      console.error('Failed to send password reset email:', err.message);
    }
  }

  res.json({ message: 'If that email exists, a reset link has been sent' });
});

const resetPassword = catchAsync(async (req, res) => {
  const { token, newPassword } = req.validated;
  const hashed = hashToken(token);

  const user = await userModel.findByResetToken(hashed);
  if (!user) throw ApiError.badRequest('Invalid or expired reset token');

  const passwordHash = await authService.hashPassword(newPassword);
  await userModel.update(user.id, {
    password_hash: passwordHash,
    password_reset_token: null,
    password_reset_expires: null,
  });

  res.json({ message: 'Password reset successfully' });
});

module.exports = { signup, login, refresh, logout, forgotPassword, resetPassword };
