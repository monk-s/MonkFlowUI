const router = require('express').Router();
const workflowController = require('../controllers/workflow.controller');
const { authenticate } = require('../middleware/auth');
const requireSuperadmin = require('../middleware/requireSuperadmin');
const { validate } = require('../middleware/validate');
const workflowValidator = require('../validators/workflow.validator');

router.use(authenticate);

// Read-only for all authenticated users
router.get('/', workflowController.list);
router.get('/:id', workflowController.getById);
router.get('/:id/executions', workflowController.listExecutions);

// Admin-only: create, edit, delete
router.post('/', requireSuperadmin, validate(workflowValidator.create), workflowController.create);
router.patch('/:id', requireSuperadmin, validate(workflowValidator.update), workflowController.update);
router.delete('/:id', requireSuperadmin, workflowController.remove);

// Execute: still available to all (workflows run for clients)
const { checkWorkflowRunLimit } = require('../middleware/checkUsage');
router.post('/:id/execute', checkWorkflowRunLimit, workflowController.execute);

module.exports = router;
