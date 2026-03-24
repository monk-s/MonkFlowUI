const { z } = require('zod');

const updateProfile = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  company: z.string().max(200).optional(),
  timezone: z.string().max(50).optional(),
  avatarUrl: z.string().url().optional().nullable(),
});

const changePassword = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
});

const deleteAccount = z.object({
  password: z.string().min(1, 'Password is required for account deletion'),
});

const updateNotificationPrefs = z.object({
  email_workflow_failures: z.boolean().optional(),
  email_appointments: z.boolean().optional(),
  email_team_updates: z.boolean().optional(),
  push_enabled: z.boolean().optional(),
});

module.exports = { updateProfile, changePassword, deleteAccount, updateNotificationPrefs };
