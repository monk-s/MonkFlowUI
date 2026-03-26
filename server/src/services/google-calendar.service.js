const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');
const env = require('../config/env');

let calendarClient = null;

function getCalendarClient() {
  if (calendarClient) return calendarClient;

  let credentials;

  // Try loading from env var first, then from file
  if (env.googleServiceAccountKey) {
    try {
      credentials = typeof env.googleServiceAccountKey === 'string'
        ? JSON.parse(env.googleServiceAccountKey)
        : env.googleServiceAccountKey;
    } catch (err) {
      console.error('Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY env var:', err.message);
    }
  }

  if (!credentials) {
    // Try loading from file
    const keyPath = path.join(__dirname, '../../google-service-account.json');
    if (fs.existsSync(keyPath)) {
      credentials = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
    } else {
      console.warn('Google Calendar: No service account credentials found. Calendar integration disabled.');
      return null;
    }
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });

  calendarClient = google.calendar({ version: 'v3', auth });
  return calendarClient;
}

/**
 * Creates a Google Calendar event for a booked appointment.
 * @param {Object} appointment - The appointment record from the database
 * @returns {Object|null} The created event (with htmlLink) or null on failure
 */
async function createCalendarEvent(appointment) {
  const calendar = getCalendarClient();
  if (!calendar) {
    console.log('[Google Calendar] Skipping — no credentials configured');
    return null;
  }

  const calendarId = env.googleCalendarId;
  if (!calendarId) {
    console.warn('[Google Calendar] No GOOGLE_CALENDAR_ID configured');
    return null;
  }

  // Build start/end datetime strings
  // appointment.date may be a JS Date object from PostgreSQL or a 'YYYY-MM-DD' string
  let dateStr = appointment.date;
  if (dateStr instanceof Date) {
    dateStr = dateStr.toISOString().split('T')[0]; // '2026-03-30'
  } else if (typeof dateStr === 'string' && dateStr.includes('T')) {
    dateStr = dateStr.split('T')[0];
  }
  // PostgreSQL time type returns 'HH:MM:SS' — use directly, don't append extra ':00'
  // Also handle 'HH:MM' format just in case
  const startTime = String(appointment.start_time).split(':').length === 3
    ? appointment.start_time   // already HH:MM:SS
    : `${appointment.start_time}:00`;  // HH:MM → HH:MM:00
  const endTime = String(appointment.end_time).split(':').length === 3
    ? appointment.end_time
    : `${appointment.end_time}:00`;
  const startDateTime = `${dateStr}T${startTime}`;
  const endDateTime = `${dateStr}T${endTime}`;

  const event = {
    summary: `MonkFlow Consultation — ${appointment.booker_name}`,
    description: [
      `Client: ${appointment.booker_name}`,
      `Email: ${appointment.booker_email}`,
      appointment.company ? `Company: ${appointment.company}` : null,
      `Type: ${appointment.meeting_type || 'Consultation'}`,
      appointment.notes ? `Notes: ${appointment.notes}` : null,
      '',
      'Booked via MonkFlow Scheduling',
    ].filter(Boolean).join('\n'),
    start: {
      dateTime: startDateTime,
      timeZone: 'America/Los_Angeles',
    },
    end: {
      dateTime: endDateTime,
      timeZone: 'America/Los_Angeles',
    },
    attendees: [
      { email: appointment.booker_email, displayName: appointment.booker_name },
    ],
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'email', minutes: 60 },
        { method: 'popup', minutes: 15 },
      ],
    },
    colorId: '10', // Basil green
  };

  console.log(`[Google Calendar] Creating event: start=${startDateTime}, end=${endDateTime}`);

  try {
    const response = await calendar.events.insert({
      calendarId,
      resource: event,
      sendUpdates: 'all', // Send email notifications to attendees
    });

    console.log(`[Google Calendar] Event created: ${response.data.htmlLink}`);
    return response.data;
  } catch (err) {
    console.error('[Google Calendar] Failed to create event:', err.message);
    return null;
  }
}

/**
 * Deletes or cancels a Google Calendar event
 */
async function deleteCalendarEvent(eventId) {
  const calendar = getCalendarClient();
  if (!calendar || !eventId) return;

  try {
    await calendar.events.delete({
      calendarId: env.googleCalendarId,
      eventId,
      sendUpdates: 'all',
    });
    console.log(`[Google Calendar] Event deleted: ${eventId}`);
  } catch (err) {
    console.error('[Google Calendar] Failed to delete event:', err.message);
  }
}

module.exports = { createCalendarEvent, deleteCalendarEvent };
