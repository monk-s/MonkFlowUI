const router = require('express').Router();
const settingsController = require('../controllers/settings.controller');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { updateNotificationPrefs } = require('../validators/user.validator');

router.use(authenticate);

router.get('/notifications', settingsController.getNotificationPrefs);
router.patch('/notifications', validate(updateNotificationPrefs), settingsController.updateNotificationPrefs);

module.exports = router;
