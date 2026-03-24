const router = require('express').Router();
const contactController = require('../controllers/contact.controller');
const { optionalAuth } = require('../middleware/auth');

router.post('/', optionalAuth, contactController.submit);

module.exports = router;
