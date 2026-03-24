const router = require('express').Router();
const authController = require('../controllers/auth.controller');
const { validate } = require('../middleware/validate');
const authValidator = require('../validators/auth.validator');
const rateLimiter = require('../middleware/rateLimiter');
const { authenticate } = require('../middleware/auth');

router.use(rateLimiter.auth);

router.post('/signup', validate(authValidator.signup), authController.signup);
router.post('/login', validate(authValidator.login), authController.login);
router.post('/refresh', validate(authValidator.refresh), authController.refresh);
router.post('/logout', authenticate, authController.logout);
router.post('/forgot-password', validate(authValidator.forgotPassword), authController.forgotPassword);
router.post('/reset-password', validate(authValidator.resetPassword), authController.resetPassword);

module.exports = router;
