const router = require('express').Router();
const userController = require('../controllers/user.controller');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const userValidator = require('../validators/user.validator');

router.use(authenticate);

router.get('/me', userController.getMe);
router.patch('/me', validate(userValidator.updateProfile), userController.updateMe);
router.patch('/me/password', validate(userValidator.changePassword), userController.changePassword);
router.delete('/me', validate(userValidator.deleteAccount), userController.deleteMe);

module.exports = router;
