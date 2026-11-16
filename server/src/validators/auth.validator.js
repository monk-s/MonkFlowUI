const { z } = require('zod');

const login = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Password is required'),
});

const refresh = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

const forgotPassword = z.object({
  email: z.string().email('Invalid email'),
});

const resetPassword = z.object({
  token: z.string().min(1, 'Token is required'),
  newPassword: z.string().min(12, 'Password must be at least 12 characters').max(500),
});

module.exports = { login, refresh, forgotPassword, resetPassword };
