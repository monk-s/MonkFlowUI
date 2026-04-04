const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const requireSuperadmin = require('../middleware/requireSuperadmin');
const projectController = require('../controllers/project.controller');

// All routes require authentication
router.use(authenticate);

// Client routes
router.get('/', projectController.listProjects);
router.get('/all', requireSuperadmin, projectController.listAllProjects); // admin view
router.get('/:id', projectController.getProject);

// Admin/owner routes (creating, updating, uploading)
router.post('/', requireSuperadmin, projectController.createProject);
router.patch('/:id', requireSuperadmin, projectController.updateProject);
router.post('/:id/updates', projectController.addUpdate);
router.post('/:id/files', projectController.uploadFile);
router.get('/:id/files/:fileId/download', projectController.downloadFile);
router.delete('/:id', requireSuperadmin, projectController.deleteProject);

module.exports = router;
