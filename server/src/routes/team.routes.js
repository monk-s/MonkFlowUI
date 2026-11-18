const router = require('express').Router();
const teamController = require('../controllers/team.controller');
const { authenticate } = require('../middleware/auth');
const requireSuperadmin = require('../middleware/requireSuperadmin');

router.use(authenticate);

router.get('/members', teamController.listMembers);
// Emails whatever address the caller names, so staff only (the staff console is its one caller).
router.post('/invite', requireSuperadmin, teamController.invite);
router.patch('/members/:id', teamController.updateMember);
router.delete('/members/:id', teamController.removeMember);

module.exports = router;
