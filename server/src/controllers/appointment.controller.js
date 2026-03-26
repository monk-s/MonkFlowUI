const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const appointmentModel = require('../models/appointment.model');
const appointmentService = require('../services/appointment.service');
const { generateToken } = require('../utils/crypto');
const { paginate, paginatedResponse } = require('../utils/pagination');
const { query } = require('../config/database');

const list = catchAsync(async (req, res) => {
  const { page, limit, offset } = paginate(req.query);
  const status = req.query.status || null;
  const [rows, total] = await Promise.all([
    appointmentModel.findByUser(req.user.userId, { limit, offset, status }),
    appointmentModel.countByUser(req.user.userId, status),
  ]);
  res.json(paginatedResponse(rows, total, { page, limit }));
});

const getAvailability = catchAsync(async (req, res) => {
  const { userId, date } = req.query;
  if (!userId || !date) throw ApiError.badRequest('userId and date are required');
  const slots = await appointmentService.getAvailableSlots(userId, date);
  res.json({ data: slots });
});

const book = catchAsync(async (req, res) => {
  const data = req.validated;
  const confirmationToken = generateToken(16);

  const appointment = await appointmentModel.bookWithLock({
    ...data,
    confirmationToken,
  });

  if (!appointment) throw ApiError.conflict('Time slot is no longer available');

  // Send confirmation emails
  try {
    const emailService = require('../services/email.service');
    await emailService.sendAppointmentConfirmation(data.bookerEmail, data.bookerName, appointment);
    await emailService.sendAppointmentNotification(data.userId, appointment);
  } catch (err) {
    console.error('Failed to send appointment emails:', err.message);
  }

  // Create Google Calendar event (non-blocking)
  try {
    const googleCalendar = require('../services/google-calendar.service');
    const calendarEvent = await googleCalendar.createCalendarEvent({
      ...appointment,
      booker_name: data.bookerName,
      booker_email: data.bookerEmail,
      company: data.company,
      notes: data.notes,
      meeting_type: data.meetingType,
    });
    if (calendarEvent?.id) {
      // Store the calendar event ID for future updates/cancellations
      await query('UPDATE appointments SET metadata = jsonb_set(COALESCE(metadata, \'{}\'::jsonb), \'{googleCalendarEventId}\', $1::jsonb) WHERE id = $2',
        [JSON.stringify(calendarEvent.id), appointment.id]);
    }
  } catch (err) {
    console.error('Failed to create Google Calendar event:', err.message);
  }

  // Create notification for the appointment owner
  await query(
    `INSERT INTO notifications (user_id, type, title, message, icon, link_page)
     VALUES ($1, 'appointment', 'New Appointment', $2, 'calendar', 'dashboard')`,
    [data.userId, `${data.bookerName} booked a ${data.meetingType || 'consultation'} on ${data.date}`]
  );

  res.status(201).json({ data: appointment });
});

const update = catchAsync(async (req, res) => {
  const appointment = await appointmentModel.findById(req.params.id);
  if (!appointment || appointment.user_id !== req.user.userId) throw ApiError.notFound('Appointment not found');

  const fields = {};
  const v = req.validated;
  if (v.status !== undefined) fields.status = v.status;
  if (v.date !== undefined) fields.date = v.date;
  if (v.startTime !== undefined) fields.start_time = v.startTime;
  if (v.endTime !== undefined) fields.end_time = v.endTime;
  if (v.notes !== undefined) fields.notes = v.notes;

  const updated = await appointmentModel.update(appointment.id, fields);
  res.json({ data: updated });
});

const getRules = catchAsync(async (req, res) => {
  const rules = await appointmentModel.getAvailabilityRules(req.user.userId);
  res.json({ data: rules });
});

const setRules = catchAsync(async (req, res) => {
  const { rules } = req.validated;
  const results = [];
  for (const rule of rules) {
    const result = await appointmentModel.upsertAvailabilityRule(
      req.user.userId, rule.dayOfWeek, rule.startTime, rule.endTime, rule.isActive
    );
    results.push(result);
  }
  res.json({ data: results });
});

module.exports = { list, getAvailability, book, update, getRules, setRules };
