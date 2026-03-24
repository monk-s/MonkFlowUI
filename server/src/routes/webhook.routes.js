const router = require('express').Router();
const webhookController = require('../controllers/webhook.controller');
const rateLimiter = require('../middleware/rateLimiter');

router.post('/:webhookId', rateLimiter.webhook, webhookController.trigger);

module.exports = router;
