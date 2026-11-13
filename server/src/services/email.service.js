const env = require('../config/env');

let resendClient = null;

function getResendClient() {
  if (!resendClient && env.resendApiKey) {
    const { Resend } = require('resend');
    resendClient = new Resend(env.resendApiKey);
  }
  return resendClient;
}

async function sendEmail({ to, subject, html, text, from, bcc, headers }) {
  const client = getResendClient();

  if (!client) {
    console.log(`[DEV EMAIL] To: ${to} | From: ${from || env.emailFrom} | Subject: ${subject}`);
    console.log(`[DEV EMAIL] Body: ${html.substring(0, 200)}...`);
    return { id: 'dev-' + Date.now() };
  }

  const fromAddr = from || env.emailFrom;

  try {
    const sendPayload = { from: fromAddr, to, subject, html };
    if (text) sendPayload.text = text;
    if (bcc) sendPayload.bcc = bcc;
    if (headers) sendPayload.headers = headers;
    const result = await client.emails.send(sendPayload);

    // Resend SDK returns { data, error } instead of throwing
    if (result?.error) {
      const errCode = result.error.statusCode || result.error.status;
      console.error(`[Email] FAILED from ${fromAddr} to ${to}: ${result.error.message}`, errCode);
      return result;
    }

    console.log(`[Email] Sent to ${to} from ${fromAddr}: id=${result?.data?.id || JSON.stringify(result)}`);
    return result;
  } catch (emailErr) {
    console.error(`[Email] EXCEPTION from ${fromAddr} to ${to}: ${emailErr.message}`, emailErr.statusCode || '');
    throw emailErr;
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

// ── Portal emails (navy and evergreen, matching the site) ─────
const escHtml = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const portalUrl = (path) => `${env.frontendUrl.replace(/\/+$/, '')}${path}`;

// One layout for every account email: heading, a few short paragraphs, one
// button, and the link spelled out underneath for clients that strip buttons.
// `paragraphs` are trusted HTML; escape any user-supplied value with escHtml.
function portalEmail({ heading, paragraphs, button, footnote }) {
  const p = (html) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#3d4a5c;">${html}</p>`;
  return `
    <div style="background:#f6f5f1;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
      <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #dfdcd3;border-radius:8px;padding:32px;">
        <div style="font-size:15px;font-weight:700;color:#12233a;margin-bottom:24px;">MonkFlow</div>
        <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:#0f1b2d;font-weight:600;">${heading}</h1>
        ${paragraphs.map(p).join('')}
        ${button ? `
        <p style="margin:22px 0;"><a href="${button.url}" style="background:#12233a;color:#ffffff;padding:11px 20px;text-decoration:none;border-radius:6px;display:inline-block;font-size:15px;font-weight:600;">${button.label}</a></p>
        <p style="margin:0 0 14px;font-size:12px;line-height:1.5;color:#5f6b7a;word-break:break-all;">Or paste this address into your browser:<br>${button.url}</p>` : ''}
        ${footnote ? `<p style="margin:18px 0 0;padding-top:16px;border-top:1px solid #dfdcd3;font-size:12px;line-height:1.5;color:#5f6b7a;">${footnote}</p>` : ''}
      </div>
    </div>`;
}

async function sendPasswordReset(email, firstName, resetToken) {
  const resetUrl = portalUrl(`/auth/reset?token=${resetToken}`);
  return sendEmail({
    to: email,
    subject: 'Reset your MonkFlow password',
    html: portalEmail({
      heading: 'Choose a new password',
      paragraphs: [`Hi ${escHtml(firstName)}, we received a request to reset the password for your MonkFlow client portal.`],
      button: { label: 'Choose a new password', url: resetUrl },
      footnote: 'This link works once and expires in 1 hour. If you did not ask for it, you can ignore this email and your password stays as it is.',
    }),
    text: `Choose a new MonkFlow password: ${resetUrl}\n\nThis link works once and expires in 1 hour. If you did not ask for it, ignore this email.`,
  });
}

// Invitation to a workspace. The only way an account is created.
async function sendPortalInvitation({ to, orgName, roleLabel, inviterName, token, expiresAt }) {
  const url = portalUrl(`/invite/${token}`);
  const expires = new Date(expiresAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  return sendEmail({
    to,
    subject: `You have been invited to ${orgName} on MonkFlow`,
    html: portalEmail({
      heading: `Join ${escHtml(orgName)} on MonkFlow`,
      paragraphs: [
        `${escHtml(inviterName)} invited you to the ${escHtml(orgName)} workspace in the MonkFlow client portal.`,
        `Your access: <strong>${escHtml(roleLabel)}</strong>.`,
      ],
      button: { label: 'Accept invitation', url },
      footnote: `This invitation is for ${escHtml(to)} only and expires on ${expires}. If you were not expecting it, you can ignore this email.`,
    }),
    text: `${inviterName} invited you to the ${orgName} workspace in the MonkFlow client portal (${roleLabel}).\n\nAccept: ${url}\n\nThis invitation is for ${to} only and expires on ${expires}.`,
  });
}

// Someone opened an expired invitation and asked for a fresh one.
async function sendInvitationRenewalRequest({ to, inviteeEmail, orgName }) {
  const recipient = to || env.emailFrom;
  return sendEmail({
    to: recipient,
    subject: `${inviteeEmail} asked for a new invitation to ${orgName}`,
    html: portalEmail({
      heading: 'A new invitation was requested',
      paragraphs: [
        `${escHtml(inviteeEmail)} opened an invitation to ${escHtml(orgName)} after it had expired and asked for a new one.`,
        'If they should still have access, send a new invitation from Settings, Team.',
      ],
      button: { label: 'Open team settings', url: portalUrl('/dashboard/settings/team') },
    }),
    text: `${inviteeEmail} opened an expired invitation to ${orgName} and asked for a new one. Send it from Settings, Team: ${portalUrl('/dashboard/settings/team')}`,
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
  sendPortalInvitation,
  sendInvitationRenewalRequest,
  sendAppointmentConfirmation,
  sendAppointmentNotification,
  sendTeamInvite,
  sendWorkflowFailureAlert,
  sendContactFormReceipt,
};
