const { z } = require('zod');

const signup = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().min(1, 'Last name is required').max(100),
  company: z.string().max(200).optional(),
});

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
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

module.exports = { signup, login, refresh, forgotPassword, resetPassword };
