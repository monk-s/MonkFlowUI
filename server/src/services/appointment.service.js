const appointmentModel = require('../models/appointment.model');
const googleCalendar = require('./google-calendar.service');

const SLOT_DURATION_MINUTES = 30;
// Availability rules and stored appointment times are Central wall-clock times.
const TZ = 'America/Chicago';
const WINDOW_DAYS = 3;            // bookable days offered, counting today
const MIN_NOTICE_MS = 2 * 60 * 60 * 1000;
const LOOKAHEAD_DAYS = 14;        // how far to look for those days

const partsFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

/** Central date and time of an instant: { date: 'YYYY-MM-DD', time: 'HH:MM' }. */
function centralParts(instant) {
  const p = {};
  for (const part of partsFmt.formatToParts(instant)) p[part.type] = part.value;
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

/** The instant of a Central wall-clock date and time. */
function centralToInstant(date, time) {
  const guess = new Date(`${date}T${time}:00Z`);
  const shown = centralParts(guess);
  return new Date(guess.getTime() + (guess.getTime() - new Date(`${shown.date}T${shown.time}:00Z`).getTime()));
}

const hhmm = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/**
 * The bookable days: the next WINDOW_DAYS dates that still have an open slot
 * at least MIN_NOTICE_MS from `now`. Days with no availability rule (weekends),
 * blocked dates and fully booked days are skipped.
 * Returns [{ date, slots: [{ startTime, endTime, startsAt }] }], times Central,
 * startsAt the ISO instant so a browser can show its own time zone.
 */
async function getWindowSlots(userId, now = new Date()) {
  const rules = await appointmentModel.getAvailabilityRules(userId);
  const earliest = now.getTime() + MIN_NOTICE_MS;
  const today = centralParts(now).date;
  // Anything already on the owner's Google Calendar (classes, other meetings).
  const busy = await googleCalendar.getBusy(now, new Date(now.getTime() + LOOKAHEAD_DAYS * 864e5));
  const days = [];

  for (let i = 0; i < LOOKAHEAD_DAYS && days.length < WINDOW_DAYS; i++) {
    const day = new Date(`${today}T00:00:00Z`);
    day.setUTCDate(day.getUTCDate() + i);
    const date = day.toISOString().slice(0, 10);
    const rule = rules.find((r) => r.day_of_week === day.getUTCDay() && r.is_active);
    if (!rule || await appointmentModel.isDateBlocked(userId, date)) continue;

    const [startH, startM] = rule.start_time.split(':').map(Number);
    const [endH, endM] = rule.end_time.split(':').map(Number);
    const appointments = await appointmentModel.findByDateRange(userId, date);
    const slots = [];
    for (let m = startH * 60 + startM; m + SLOT_DURATION_MINUTES <= endH * 60 + endM; m += SLOT_DURATION_MINUTES) {
      const startTime = hhmm(m);
      const endTime = hhmm(m + SLOT_DURATION_MINUTES);
      const startsAt = centralToInstant(date, startTime);
      const startMs = startsAt.getTime();
      if (startMs < earliest) continue;
      if (busy.some((b) => startMs < b.end && startMs + SLOT_DURATION_MINUTES * 60000 > b.start)) continue;
      const taken = appointments.some((a) => startTime < a.end_time.substring(0, 5) && endTime > a.start_time.substring(0, 5));
      if (!taken) slots.push({ startTime, endTime, startsAt: startsAt.toISOString() });
    }
    if (slots.length) days.push({ date, slots });
  }
  return days;
}

/** Open slots for one date; empty when the date is outside the booking window. */
async function getAvailableSlots(userId, dateStr, now = new Date()) {
  const day = (await getWindowSlots(userId, now)).find((d) => d.date === dateStr);
  return day ? day.slots.map((s) => ({ ...s, booked: false })) : [];
}

/** True when this exact slot is one a visitor could have been offered. */
async function isBookable(userId, date, startTime, endTime, now = new Date()) {
  const slots = await getAvailableSlots(userId, date, now);
  return slots.some((s) => s.startTime === startTime && s.endTime === endTime);
}

module.exports = { getWindowSlots, getAvailableSlots, isBookable, centralToInstant, TZ };
