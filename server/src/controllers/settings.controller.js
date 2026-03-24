const catchAsync = require('../utils/catchAsync');
const userModel = require('../models/user.model');

const getNotificationPrefs = catchAsync(async (req, res) => {
  const user = await userModel.findById(req.user.userId);
  res.json({ preferences: user.notification_prefs });
});

const updateNotificationPrefs = catchAsync(async (req, res) => {
  const user = await userModel.findById(req.user.userId);
  const merged = { ...user.notification_prefs, ...req.validated };
  const updated = await userModel.update(user.id, { notification_prefs: JSON.stringify(merged) });
  res.json({ preferences: updated.notification_prefs });
});

module.exports = { getNotificationPrefs, updateNotificationPrefs };
