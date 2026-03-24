const router = require('express').Router();
const logController = require('../controllers/log.controller');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);
router.get('/', logController.list);

module.exports = router;
