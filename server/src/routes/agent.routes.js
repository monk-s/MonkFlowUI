const router = require('express').Router();
const agentController = require('../controllers/agent.controller');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const agentValidator = require('../validators/agent.validator');
const rateLimiter = require('../middleware/rateLimiter');

router.use(authenticate);

router.get('/', agentController.list);
router.post('/', validate(agentValidator.create), agentController.create);
router.get('/:id', agentController.getById);
router.patch('/:id', validate(agentValidator.update), agentController.update);
router.delete('/:id', agentController.remove);
router.post('/:id/execute', rateLimiter.agentExecute, validate(agentValidator.execute), agentController.execute);
router.get('/:id/executions', agentController.listExecutions);

module.exports = router;
