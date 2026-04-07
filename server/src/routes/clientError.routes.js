const router = require('express').Router();
const rateLimiter = require('../middleware/rateLimiter');
const ctrl = require('../controllers/clientError.controller');

router.post(
  '/',
  rateLimiter.clientErrorsGlobal,
  rateLimiter.clientErrorsPerIp,
  ctrl.reportError
);

module.exports = router;
