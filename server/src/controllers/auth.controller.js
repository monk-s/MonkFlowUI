const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const authService = require('../services/auth.service');
const userModel = require('../models/user.model');
const { hashToken } = require('../utils/crypto');
const { query } = require('../config/database');
const sessions = require('../services/session.service');
const refreshTokenModel = require('../models/refreshToken.model');
const { audit } = require('../portal/audit');

// Account creation lives in session.controller.js (acceptInvitation). There
// is deliberately no open signup: an account exists only because someone
// was invited to a workspace.

const login = catchAsync(async (req, res) => {
  const { email, password } = req.validated;

  const user = await userModel.findByEmailCI(email);
  // SSO-only accounts have no password hash.
  if (!user || !user.password_hash) throw ApiError.unauthorized('Invalid email or password');

  const valid = await authService.comparePassword(password, user.password_hash);
  if (!valid) throw ApiError.unauthorized('Invalid email or password');

  // This older endpoint must not be a way around a firm's SSO requirement.
  const domain = String(user.email).split('@')[1] || '';
  const sso = await query(
    'SELECT 1 FROM organizations WHERE sso_required = TRUE AND $1 = ANY(allowed_email_domains) LIMIT 1',
    [domain.toLowerCase()]
  );
  if (sso.rows.length) throw ApiError.forbidden('Your firm requires single sign-on. Use the Sign in page.');

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
  const user = await userModel.findByEmailCI(email);

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

  // A changed password ends every open session for that person.
  await sessions.revokeAllForUser(user.id);
  await refreshTokenModel.revokeAllForUser(user.id).catch(() => {});
  await audit(null, req, {
    orgId: user.home_org_id || null, actorUserId: user.id, actorEmail: user.email, actorRole: null,
    action: 'auth.password_reset', targetType: 'user', targetId: user.id,
  });

  res.json({ message: 'Password reset successfully' });
});

module.exports = { login, refresh, logout, forgotPassword, resetPassword };
