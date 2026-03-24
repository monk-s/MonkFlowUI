const router = require('express').Router();
const apiKeyController = require('../controllers/apiKey.controller');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.get('/', apiKeyController.list);
router.post('/', apiKeyController.create);
router.delete('/:id', apiKeyController.remove);

module.exports = router;
