const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const planController = require('../controllers/plan.controller');

router.use(authenticate);
router.get('/', planController.listPlans);
router.get('/my-usage', planController.getMyUsage);

module.exports = router;
