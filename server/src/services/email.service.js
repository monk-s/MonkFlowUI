const env = require('../config/env');

let resendClient = null;

function getResendClient() {
  if (!resendClient && env.resendApiKey) {
    const { Resend } = require('resend');
    resendClient = new Resend(env.resendApiKey);
  }
  return resendClient;
}

async function sendEmail({ to, subject, html, from, bcc }) {
  const client = getResendClient();

  if (!client) {
    console.log(`[DEV EMAIL] To: ${to} | From: ${from || env.emailFrom} | Subject: ${subject}`);
    console.log(`[DEV EMAIL] Body: ${html.substring(0, 200)}...`);
    return { id: 'dev-' + Date.now() };
  }

  // If a custom `from` is provided (e.g. sender rotation), use it directly with Resend default fallback
  // Otherwise use the configured domain first, fall back to Resend's default if domain not verified
  const fromAddresses = from
    ? [from, 'MonkFlow <onboarding@resend.dev>']
    : [env.emailFrom, 'MonkFlow <onboarding@resend.dev>'];

  for (const fromAddr of fromAddresses) {
    try {
      const sendPayload = { from: fromAddr, to, subject, html };
      if (bcc) sendPayload.bcc = bcc;
      const result = await client.emails.send(sendPayload);

      // Resend SDK returns { data, error } instead of throwing
      if (result?.error) {
        const errCode = result.error.statusCode || result.error.status;
        console.error(`[Email] FAILED from ${fromAddr} to ${to}: ${result.error.message}`, errCode);
        if (errCode === 403 && fromAddr === env.emailFrom) {
          console.log(`[Email] Domain not verified, retrying with Resend default sender...`);
          continue;
        }
        return result; // Return error result if not retryable
      }

      console.log(`[Email] Sent to ${to} from ${fromAddr}: id=${result?.data?.id || JSON.stringify(result)}`);
      return result;
    } catch (emailErr) {
      console.error(`[Email] EXCEPTION from ${fromAddr} to ${to}: ${emailErr.message}`, emailErr.statusCode || '');
      if ((emailErr.statusCode === 403) && fromAddr === env.emailFrom) {
        console.log(`[Email] Domain not verified, retrying with Resend default sender...`);
        continue;
      }
      throw emailErr;
    }
  }
}

// ── Templates ──────────────────────────────────────────

async function sendWelcome(email, firstName) {
  return sendEmail({
    to: email,
    subject: 'Welcome to MonkFlow',
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #00cc6a;">Welcome to MonkFlow, ${firstName}!</h1>
        <p>Your account has been created. You can now:</p>
        <ul>
          <li>Create and automate workflows</li>
          <li>Deploy AI agents</li>
          <li>Manage appointments</li>
          <li>Invite your team</li>
        </ul>
        <p><a href="${env.frontendUrl}" style="background: #00cc6a; color: #000; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Go to Dashboard</a></p>
      </div>
    `,
  });
}

async function sendPasswordReset(email, firstName, resetToken) {
  const resetUrl = `${env.frontendUrl}?reset=${resetToken}`;
  return sendEmail({
    to: email,
    subject: 'Reset Your MonkFlow Password',
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #00cc6a;">Password Reset</h1>
        <p>Hi ${firstName}, we received a request to reset your password.</p>
        <p><a href="${resetUrl}" style="background: #00cc6a; color: #000; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Reset Password</a></p>
        <p style="color: #666; font-size: 14px;">This link expires in 1 hour. If you didn't request this, ignore this email.</p>
      </div>
    `,
  });
}

function formatAppointmentDate(d) {
  if (d instanceof Date) return d.toISOString().split('T')[0];
  if (typeof d === 'string' && d.includes('T')) return d.split('T')[0];
  return d;
}

async function sendAppointmentConfirmation(email, bookerName, appointment) {
  const dateStr = formatAppointmentDate(appointment.date);
  return sendEmail({
    to: email,
    subject: `Appointment Confirmed — ${dateStr}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #00cc6a;">Appointment Confirmed</h1>
        <p>Hi ${bookerName}, your appointment has been confirmed.</p>
        <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <p><strong>Date:</strong> ${dateStr}</p>
          <p><strong>Time:</strong> ${appointment.start_time} - ${appointment.end_time}</p>
          <p><strong>Type:</strong> ${appointment.meeting_type}</p>
        </div>
        <p style="color: #666; font-size: 14px;">You'll receive a reminder before your appointment.</p>
      </div>
    `,
  });
}

async function sendAppointmentNotification(userId, appointment) {
  const userModel = require('../models/user.model');
  const user = await userModel.findById(userId);
  if (!user) return;

  // Send to the owner's notification email (nathan@monkflow.io), falling back to DB email
  const ownerEmail = process.env.OWNER_NOTIFICATION_EMAIL || user.email;

  const notifDateStr = formatAppointmentDate(appointment.date);
  return sendEmail({
    to: ownerEmail,
    subject: `New Appointment: ${appointment.booker_name}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #00cc6a;">New Appointment Booked</h1>
        <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <p><strong>Client:</strong> ${appointment.booker_name} (${appointment.booker_email})</p>
          <p><strong>Date:</strong> ${notifDateStr}</p>
          <p><strong>Time:</strong> ${appointment.start_time} - ${appointment.end_time}</p>
          <p><strong>Type:</strong> ${appointment.meeting_type}</p>
          ${appointment.notes ? `<p><strong>Notes:</strong> ${appointment.notes}</p>` : ''}
        </div>
        <p><a href="${env.frontendUrl}" style="background: #00cc6a; color: #000; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">View Dashboard</a></p>
      </div>
    `,
  });
}

async function sendTeamInvite(email, name, inviteToken) {
  const inviteUrl = `${env.frontendUrl}?invite=${inviteToken}`;
  return sendEmail({
    to: email,
    subject: 'You\'ve been invited to MonkFlow',
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #00cc6a;">Team Invitation</h1>
        <p>Hi${name ? ` ${name}` : ''}, you've been invited to join a MonkFlow team.</p>
        <p><a href="${inviteUrl}" style="background: #00cc6a; color: #000; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Accept Invitation</a></p>
      </div>
    `,
  });
}

async function sendWorkflowFailureAlert(email, firstName, workflowName, errorMessage) {
  return sendEmail({
    to: email,
    subject: `Workflow Failed: ${workflowName}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #ff4444;">Workflow Failure Alert</h1>
        <p>Hi ${firstName}, your workflow "${workflowName}" has failed.</p>
        <div style="background: #fff0f0; padding: 16px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #ff4444;">
          <p><strong>Error:</strong> ${errorMessage}</p>
        </div>
        <p><a href="${env.frontendUrl}" style="background: #00cc6a; color: #000; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">View Workflow</a></p>
      </div>
    `,
  });
}

async function sendContactFormReceipt(email, name, subject) {
  return sendEmail({
    to: email,
    subject: `We received your message: ${subject}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #00cc6a;">Message Received</h1>
        <p>Hi ${name}, thanks for reaching out! We've received your message about "${subject}" and will get back to you within 24 hours.</p>
        <p>— The MonkFlow Team</p>
      </div>
    `,
  });
}

module.exports = {
  sendEmail,
  sendWelcome,
  sendPasswordReset,
  sendAppointmentConfirmation,
  sendAppointmentNotification,
  sendTeamInvite,
  sendWorkflowFailureAlert,
  sendContactFormReceipt,
};
