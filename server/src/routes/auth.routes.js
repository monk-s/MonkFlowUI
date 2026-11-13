const router = require('express').Router();
const authController = require('../controllers/auth.controller');
const session = require('../controllers/session.controller');
const { validate } = require('../middleware/validate');
const authValidator = require('../validators/auth.validator');
const rateLimiter = require('../middleware/rateLimiter');
const { authenticate } = require('../middleware/auth');
const { requireSession, sameOrigin } = require('../middleware/session');
const env = require('../config/env');

// ── Portal v2: cookie sessions ────────────────────────────────
// Accounts are created only by accepting an invitation. There is no signup
// route.
router.use(sameOrigin);

const read = rateLimiter.sessionRead;
const attempt = rateLimiter.signInAttempt;
const perEmail = rateLimiter.signInPerEmail;

router.get('/config', read, session.getConfig);
router.get('/session', read, session.getSession);
router.post('/session/touch', read, requireSession, session.touch);
router.post('/session/workspace', read, requireSession, session.selectWorkspace);
router.post('/sign-out', read, session.signOut);

router.post('/discover', attempt, session.discover);
router.post('/sign-in', attempt, perEmail, session.signIn);
router.post('/mfa/verify', attempt, session.verifyMfa);
router.post('/mfa/enroll', attempt, requireSession, session.enrollMfa);
router.post('/mfa/enroll/confirm', attempt, requireSession, session.confirmMfa);
router.post('/email-code', attempt, perEmail, session.sendEmailCode);
router.post('/email-code/verify', attempt, perEmail, session.verifyEmailCode);

router.get('/sso/stub-idp', attempt, session.stubIdp);
router.get('/sso/callback', attempt, session.ssoCallback);
router.get('/sso/:provider/start', attempt, session.ssoStart);

router.get('/invitations/:token', attempt, session.getInvitation);
router.post('/invitations/:token/accept', attempt, session.acceptInvitationHandler);
router.post('/invitations/:token/request-new', attempt, session.requestNewInvitation);

router.post('/forgot-password', attempt, validate(authValidator.forgotPassword), authController.forgotPassword);
router.post('/reset-password', attempt, validate(authValidator.resetPassword), authController.resetPassword);

// ── Previous JWT endpoints ────────────────────────────────────
// Kept for one release so a browser still running the previous app.js can
// sign in while the new front end deploys (LEGACY_JWT_LOGIN, config/env.js).
// Off automatically once a hosted identity provider is in use, because
// these would be a way around its MFA and SSO rules.
if (env.legacyJwtLogin && env.identityProvider === 'local') {
  router.post('/login', rateLimiter.auth, validate(authValidator.login), authController.login);
  router.post('/refresh', rateLimiter.auth, validate(authValidator.refresh), authController.refresh);
  router.post('/logout', rateLimiter.auth, authenticate, authController.logout);
}

module.exports = router;
