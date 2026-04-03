const router = require('express').Router();
const integrationController = require('../controllers/integration.controller');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.get('/', integrationController.list);
router.get('/:provider', integrationController.getByProvider);
router.post('/:provider/test', integrationController.test);
router.post('/:provider/connect', integrationController.connect);
router.post('/:provider/disconnect', integrationController.disconnect);

module.exports = router;
