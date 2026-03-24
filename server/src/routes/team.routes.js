const router = require('express').Router();
const teamController = require('../controllers/team.controller');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.get('/members', teamController.listMembers);
router.post('/invite', teamController.invite);
router.patch('/members/:id', teamController.updateMember);
router.delete('/members/:id', teamController.removeMember);

module.exports = router;
