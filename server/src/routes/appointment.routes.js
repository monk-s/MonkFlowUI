const router = require('express').Router();
const appointmentController = require('../controllers/appointment.controller');
const { authenticate, optionalAuth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const appointmentValidator = require('../validators/appointment.validator');

// Public routes
router.get('/availability', appointmentController.getAvailability);
router.post('/book', validate(appointmentValidator.book), appointmentController.book);

// Authenticated routes
router.get('/', authenticate, appointmentController.list);
router.patch('/:id', authenticate, validate(appointmentValidator.updateAppointment), appointmentController.update);
router.get('/rules', authenticate, appointmentController.getRules);
router.put('/rules', authenticate, validate(appointmentValidator.availabilityRule), appointmentController.setRules);

module.exports = router;
