const appointmentModel = require('../models/appointment.model');

const SLOT_DURATION_MINUTES = 30;

/**
 * Get available time slots for a given user and date.
 */
async function getAvailableSlots(userId, dateStr) {
  const date = new Date(dateStr);
  const dayOfWeek = date.getDay(); // 0=Sunday

  // Get availability rule for this day
  const rules = await appointmentModel.getAvailabilityRules(userId);
  const rule = rules.find(r => r.day_of_week === dayOfWeek && r.is_active);

  if (!rule) return []; // No availability on this day

  // Check if date is blocked
  const blocked = await appointmentModel.isDateBlocked(userId, dateStr);
  if (blocked) return [];

  // Generate slots
  const slots = [];
  const [startH, startM] = rule.start_time.split(':').map(Number);
  const [endH, endM] = rule.end_time.split(':').map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  for (let m = startMinutes; m + SLOT_DURATION_MINUTES <= endMinutes; m += SLOT_DURATION_MINUTES) {
    const h = Math.floor(m / 60);
    const min = m % 60;
    const slotStart = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    const endM2 = m + SLOT_DURATION_MINUTES;
    const h2 = Math.floor(endM2 / 60);
    const min2 = endM2 % 60;
    const slotEnd = `${String(h2).padStart(2, '0')}:${String(min2).padStart(2, '0')}`;
    slots.push({ startTime: slotStart, endTime: slotEnd });
  }

  // Mark occupied slots
  const appointments = await appointmentModel.findByDateRange(userId, dateStr);

  return slots.map(slot => {
    const booked = appointments.some(appt => {
      const apptStart = appt.start_time.substring(0, 5);
      const apptEnd = appt.end_time.substring(0, 5);
      return slot.startTime < apptEnd && slot.endTime > apptStart;
    });
    return { ...slot, booked };
  });
}

module.exports = { getAvailableSlots };
