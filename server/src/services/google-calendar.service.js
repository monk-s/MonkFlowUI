const { GoogleAuth } = require('google-auth-library');
const path = require('path');
const fs = require('fs');
const env = require('../config/env');

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
let authClient = null;

async function getAuthClient() {
  if (authClient) return authClient;

  let credentials;

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
    const keyPath = path.join(__dirname, '../../google-service-account.json');
    if (fs.existsSync(keyPath)) {
      credentials = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
    } else {
      console.warn('Google Calendar: No service account credentials found. Calendar integration disabled.');
      return null;
    }
  }

  const auth = new GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });

  authClient = await auth.getClient();
  return authClient;
}

async function calendarFetch(method, urlPath, body) {
  const client = await getAuthClient();
  if (!client) return null;

  const url = `${CALENDAR_API}${urlPath}`;
  const opts = { url, method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);

  const res = await client.request(opts);
  return res.data;
}

async function createCalendarEvent(appointment) {
  const client = await getAuthClient();
  if (!client) {
    console.log('[Google Calendar] Skipping — no credentials configured');
    return null;
  }

  const calendarId = env.googleCalendarId;
  if (!calendarId) {
    console.warn('[Google Calendar] No GOOGLE_CALENDAR_ID configured');
    return null;
  }

  let dateStr = appointment.date;
  if (dateStr instanceof Date) {
    dateStr = dateStr.toISOString().split('T')[0];
  } else if (typeof dateStr === 'string' && dateStr.includes('T')) {
    dateStr = dateStr.split('T')[0];
  }

  const startTime = String(appointment.start_time).split(':').length === 3
    ? appointment.start_time
    : `${appointment.start_time}:00`;
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
      timeZone: appointment.timezone || 'America/Chicago',
    },
    end: {
      dateTime: endDateTime,
      timeZone: appointment.timezone || 'America/Chicago',
    },
    reminders: { useDefault: true },
    colorId: '10',
  };

  console.log(`[Google Calendar] Creating event: start=${startDateTime}, end=${endDateTime}`);

  try {
    const data = await calendarFetch('POST', `/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=none`, event);
    console.log(`[Google Calendar] Event created: ${data.htmlLink}`);
    return data;
  } catch (err) {
    console.error('[Google Calendar] Failed to create event:', err.message);
    return null;
  }
}

async function deleteCalendarEvent(eventId) {
  if (!eventId) return;
  const calendarId = env.googleCalendarId;
  if (!calendarId) return;

  try {
    await calendarFetch('DELETE', `/calendars/${encodeURIComponent(calendarId)}/events/${eventId}?sendUpdates=all`);
    console.log(`[Google Calendar] Event deleted: ${eventId}`);
  } catch (err) {
    console.error('[Google Calendar] Failed to delete event:', err.message);
  }
}

module.exports = { createCalendarEvent, deleteCalendarEvent };
