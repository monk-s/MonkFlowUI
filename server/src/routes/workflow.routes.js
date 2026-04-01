const router = require('express').Router();
const workflowController = require('../controllers/workflow.controller');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const workflowValidator = require('../validators/workflow.validator');

router.use(authenticate);

router.get('/', workflowController.list);
router.post('/', validate(workflowValidator.create), workflowController.create);
router.get('/:id', workflowController.getById);
router.patch('/:id', validate(workflowValidator.update), workflowController.update);
router.delete('/:id', workflowController.remove);
const { checkWorkflowRunLimit } = require('../middleware/checkUsage');
router.post('/:id/execute', checkWorkflowRunLimit, workflowController.execute);
router.get('/:id/executions', workflowController.listExecutions);

module.exports = router;
