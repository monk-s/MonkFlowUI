const router = require('express').Router();
const agentController = require('../controllers/agent.controller');
const { authenticate } = require('../middleware/auth');
const requireSuperadmin = require('../middleware/requireSuperadmin');
const { validate } = require('../middleware/validate');
const agentValidator = require('../validators/agent.validator');
const rateLimiter = require('../middleware/rateLimiter');

router.use(authenticate);

// Read-only for all authenticated users
router.get('/', agentController.list);
router.get('/:id', agentController.getById);
router.get('/:id/executions', agentController.listExecutions);

// Admin-only: create, edit, delete, enhance
router.post('/', requireSuperadmin, validate(agentValidator.create), agentController.create);
router.post('/enhance-prompt', requireSuperadmin, agentController.enhancePrompt);
router.patch('/:id', requireSuperadmin, validate(agentValidator.update), agentController.update);
router.delete('/:id', requireSuperadmin, agentController.remove);

// Execute: still available to all (agents run for clients)
const { checkAgentTaskLimit } = require('../middleware/checkUsage');
router.post('/:id/execute', rateLimiter.agentExecute, checkAgentTaskLimit, validate(agentValidator.execute), agentController.execute);

module.exports = router;
