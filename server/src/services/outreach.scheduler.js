const cron = require('node-cron');

let job = null;

// OOO detection patterns (reserved for future reply auto-classification)
const OOO_PATTERNS = [
  /out of (the )?office/i,
  /auto[- ]?reply/i,
  /automatic reply/i,
  /away from (my )?desk/i,
  /on (annual |paid )?leave/i,
  /on vacation/i,
  /currently (out|away|unavailable)/i,
  /will (be back|return|respond)/i,
  /i('m| am) (currently )?(out|away|traveling)/i,
];

function addBusinessDays(from, days) {
  const date = new Date(from);
  let added = 0;
  while (added < days) {
    date.setDate(date.getDate() + 1);
    const dow = date.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return date;
}

function getNextFollowupDate(touchCount) {
  const from = new Date();
  switch (touchCount) {
    case 2: return addBusinessDays(from, 5);  // After Touch 2: +5 biz days (~Day 8)
    case 3: return addBusinessDays(from, 7);  // After Touch 3: +7 biz days (~Day 17)
    default: return null;
  }
}

function getFollowupTemplate(touchNumber, lead) {
  const { getFirstName, cleanCompanyName } = require('../utils/nameParser');
  const env = require('../config/env');
  const firstName = getFirstName(lead.contact_name, lead.contact_email);
  const rawCompany = lead.company ? cleanCompanyName(lead.company, lead.contact_email) : '';
  const company = rawCompany ? ` at ${rawCompany}` : '';
  const origSubject = lead.original_subject || lead.ai_email_subject || 'your business';
  const reSubject = `Re: ${origSubject}`;

  const unsubToken = lead.unsubscribe_token;
  const unsubUrl = unsubToken ? `https://monkflow.io/api/v1/leadgen/unsubscribe/${unsubToken}` : null;
  const unsubFooter = unsubUrl
    ? `<div style="margin-top:20px;font-size:11px;color:#999;"><p><a href="${unsubUrl}" style="color:#999;">Unsubscribe</a></p></div>`
    : '';
  const trackingPixel = unsubToken
    ? `<img src="https://monkflow.io/api/v1/outreach/track/open/${unsubToken}" width="1" height="1" style="display:none" alt="" />`
    : '';

  // Placeholder fallback matches env.js — set BOOKING_URL in Railway.
  const bookingUrl = env.bookingUrl || 'https://cal.com/PLACEHOLDER-SET-BOOKING-URL-ENV';
  // New named-deliverable sequence: one offer, re-asked with decreasing length.
  // These fallbacks only fire when AI generation errors — the AI path uses the
  // matching instructions in outreach-ai.service.js::generateFollowup.
  switch (touchNumber) {
    case 2: return {
      subject: reSubject,
      body: `<div style="font-family:sans-serif;max-width:600px;"><p>Hey ${firstName},</p><p>Still have that 1-page map of automations I offered to send${rawCompany ? ` for ${rawCompany}` : ''} — want it?</p><p>Reply "send it" and it's yours.</p><p>Nathan</p></div>${unsubFooter}${trackingPixel}`,
    };
    case 3: return {
      subject: reSubject,
      body: `<div style="font-family:sans-serif;max-width:600px;"><p>Hey ${firstName},</p><p>We cut a dental practice's scheduling from 18 hrs/week to under 2 with a similar build. Same opportunity${company}.</p><p>Still happy to send the 1-page map — just reply "send it".</p><p>Nathan</p><p style="font-size:13px;color:#666;">P.S. Or grab 15 min: <a href="${bookingUrl}">${bookingUrl}</a></p></div>${unsubFooter}${trackingPixel}`,
    };
    case 4: return {
      subject: reSubject,
      body: `<div style="font-family:sans-serif;max-width:600px;"><p>Hey ${firstName},</p><p>Closing the loop — totally get if this isn't a priority. Best of luck${company}.</p><p>Nathan</p><p style="font-size:13px;color:#666;">P.S. If it ever comes up: <a href="${bookingUrl}">${bookingUrl}</a></p></div>${unsubFooter}${trackingPixel}`,
    };
    default: return null;
  }
}

function formatFollowupHtml(body, lead) {
  const unsubToken = lead.unsubscribe_token;
  const unsubUrl = unsubToken ? `https://monkflow.io/api/v1/leadgen/unsubscribe/${unsubToken}` : null;
  const unsubFooter = unsubUrl
    ? `<div style="margin-top:20px;font-size:11px;color:#999;"><p><a href="${unsubUrl}" style="color:#999;">Unsubscribe</a></p></div>`
    : '';
  const trackingPixel = unsubToken
    ? `<img src="https://monkflow.io/api/v1/outreach/track/open/${unsubToken}" width="1" height="1" style="display:none" alt="" />`
    : '';

  const htmlBody = `<div style="font-family:sans-serif;max-width:600px;">${body.split('\n').map(line => {
    if (!line.trim()) return '';
    const linked = line.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#333;text-decoration:underline;">$1</a>');
    return `<p style="margin:0 0 12px;">${linked}</p>`;
  }).join('')}</div>${unsubFooter}${trackingPixel}`;

  return htmlBody;
}

/**
 * Process all outreach leads whose next_followup_at has come due.
 * Safe to call from cron, admin endpoint, or standalone script — writes its
 * own heartbeat row and returns a stats object.
 */
// Extract bare email from "Name <addr@host>" or return raw addr
function extractSenderEmail(from) {
  if (!from) return null;
  const m = from.match(/<([^>]+)>/);
  return (m ? m[1] : from).trim().toLowerCase();
}

async function processDueFollowups() {
  const { query } = require('../config/database');
  const { sendEmail } = require('./email.service');
  const env = require('../config/env');
  const { generateFollowup } = require('./outreach-ai.service');
  const { trackSend, trackBounce } = require('./leadgen.service');

  // Heartbeat (latest-only) — kept for backwards compat with admin page
  let runId = null;
  try {
    await query(
      `INSERT INTO scheduler_heartbeats (name, last_run_at, last_status, last_detail, updated_at)
       VALUES ('outreach', NOW(), 'started', NULL, NOW())
       ON CONFLICT (name) DO UPDATE SET last_run_at = NOW(), last_status = 'started', last_detail = NULL, updated_at = NOW()`
    );
  } catch (_) {}
  // Append-only run log — survives hourly overwrites
  try {
    const { rows } = await query(
      `INSERT INTO scheduler_runs (scheduler_name, status, started_at) VALUES ('outreach', 'started', NOW()) RETURNING id`
    );
    runId = rows[0]?.id || null;
  } catch (_) { /* table may not exist yet if migration hasn't run */ }

  try {
    const { rows: dueLeads } = await query(
      `SELECT ol.*,
              (SELECT gmail_message_id FROM outreach_emails WHERE lead_id = ol.id ORDER BY touch_number ASC LIMIT 1) AS first_message_id,
              (SELECT subject FROM outreach_emails WHERE lead_id = ol.id ORDER BY touch_number ASC LIMIT 1) AS first_subject
       FROM outreach_leads ol
       WHERE ol.status = 'active'
         AND ol.next_followup_at <= NOW()
         AND ol.touch_count < 4
       ORDER BY COALESCE(ol.lead_score, 0) DESC, ol.next_followup_at ASC`
    );

    let sent = 0, completed = 0, errors = 0, aiGenerated = 0;

    const { isRoleBasedEmail } = require('../utils/nameParser');

    for (const lead of dueLeads) {
      // Close role-based emails — nobody monitors info@, contact@, etc.
      if (isRoleBasedEmail(lead.contact_email)) {
        await query(`UPDATE outreach_leads SET status='closed', next_followup_at=NULL, updated_at=NOW() WHERE id=$1`, [lead.id]);
        console.log(`[OUTREACH] Closed role-based email lead: ${lead.contact_email}`);
        completed++;
        continue;
      }

      if (!lead.original_subject && lead.first_subject) {
        lead.original_subject = lead.first_subject;
      }

      const nextTouch = lead.touch_count + 1;

      let template;
      try {
        const aiResult = await generateFollowup(lead, nextTouch);
        template = {
          subject: aiResult.subject,
          body: formatFollowupHtml(aiResult.body, lead),
        };
        aiGenerated++;
        await new Promise(r => setTimeout(r, 1500));
      } catch (aiErr) {
        console.warn(`[OUTREACH] AI follow-up failed for ${lead.contact_email}, using static template:`, aiErr.message);
        template = getFollowupTemplate(nextTouch, lead);
      }

      if (!template) {
        await query(
          `UPDATE outreach_leads SET status = 'closed', next_followup_at = NULL, updated_at = NOW() WHERE id = $1`,
          [lead.id]
        );
        completed++;
        continue;
      }

      try {
        const replyTo = process.env.LEADGEN_REPLY_TO || 'nathan@mail.getmonkflow.com';
        const messageId = lead.original_message_id || lead.first_message_id;
        const emailHeaders = { 'Reply-To': replyTo };

        if (messageId) {
          const threadRef = messageId.includes('<') ? messageId : `<${messageId}>`;
          emailHeaders['In-Reply-To'] = threadRef;
          emailHeaders['References'] = threadRef;
        } else {
          // No original Message-ID means we cannot RFC-5322 thread this as a reply.
          // Strip any "Re:" prefix the template/AI added so the email doesn't look
          // like a fake reply in inboxes that don't nest it (major deliverability
          // hit otherwise). Logged so we can audit orphaned leads.
          if (template.subject && /^re:\s*/i.test(template.subject)) {
            template.subject = template.subject.replace(/^re:\s*/i, '').trim();
            if (!template.subject) template.subject = lead.ai_email_subject || 'quick follow-up';
          }
          console.warn(`[OUTREACH] No Message-ID for ${lead.contact_email} (lead ${lead.id}) — sending as non-threaded follow-up`);
        }

        const unsubToken = lead.unsubscribe_token;
        if (unsubToken) {
          const unsubUrl = `https://monkflow.io/api/v1/leadgen/unsubscribe/${unsubToken}`;
          emailHeaders['List-Unsubscribe'] = `<${unsubUrl}>`;
          emailHeaders['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
        }

        const plainText = template.body
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<\/p>/gi, '\n\n')
          .replace(/<[^>]+>/g, '')
          .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
          .replace(/\n{3,}/g, '\n\n')
          .trim();

        const fromAddr = env.outreachFromEmail;
        const senderEmail = extractSenderEmail(fromAddr);

        const emailResult = await sendEmail({
          from: fromAddr,
          to: lead.contact_email,
          subject: template.subject,
          html: template.body,
          text: plainText,
          headers: emailHeaders,
        });

        const gmailId = emailResult?.data?.id || emailResult?.id || null;

        // Track in sender_health so admin deliverability widget reflects
        // ALL sends (initial + follow-up), matching Resend dashboard totals.
        if (senderEmail) {
          try { await trackSend(senderEmail); } catch (_) {}
        }

        await query(
          `INSERT INTO outreach_emails (lead_id, touch_number, subject, body, gmail_message_id, variant, delivered_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
          [lead.id, nextTouch, template.subject, template.body, gmailId, lead.email_variant || '1']
        );

        const nextFollowup = getNextFollowupDate(nextTouch);
        if (nextTouch >= 4) {
          await query(
            `UPDATE outreach_leads SET touch_count = $1, last_sent_at = NOW(), next_followup_at = NULL, status = 'closed', updated_at = NOW() WHERE id = $2`,
            [nextTouch, lead.id]
          );
          completed++;
        } else {
          await query(
            `UPDATE outreach_leads SET touch_count = $1, last_sent_at = NOW(), next_followup_at = $2, updated_at = NOW() WHERE id = $3`,
            [nextTouch, nextFollowup, lead.id]
          );
        }

        sent++;
      } catch (err) {
        console.error(`[OUTREACH] Failed to send to ${lead.contact_email}:`, err.message);
        // Resend rejects obvious bounces synchronously (422 / bad recipient).
        // Non-sync bounces come via /resend/webhook and are tracked there.
        const msg = (err && err.message) || '';
        if (/bounce|invalid|not.*exist|undeliverable|rejected/i.test(msg)) {
          const senderEmail = extractSenderEmail(env.outreachFromEmail);
          if (senderEmail) {
            try { await trackBounce(senderEmail); } catch (_) {}
          }
        }
        errors++;
      }
    }

    const stats = { sent, aiGenerated, completed, errors };
    console.log(`[OUTREACH] Done: ${sent} sent (${aiGenerated} AI-generated), ${completed} completed, ${errors} errors`);
    try {
      await query(
        `UPDATE scheduler_heartbeats SET last_status = 'success', last_detail = $1, updated_at = NOW() WHERE name = 'outreach'`,
        [JSON.stringify(stats)]
      );
    } catch (_) {}
    // Append-only log
    if (runId) {
      try { await query(`UPDATE scheduler_runs SET status='success', detail=$1, finished_at=NOW() WHERE id=$2`, [JSON.stringify(stats), runId]); } catch (_) {}
    }
    return stats;
  } catch (err) {
    console.error('[OUTREACH] processDueFollowups FAILED:', err.message, err.stack);
    const errDetail = JSON.stringify({ error: err.message });
    try {
      const { query: q2 } = require('../config/database');
      await q2(
        `UPDATE scheduler_heartbeats SET last_status = 'failed', last_detail = $1, updated_at = NOW() WHERE name = 'outreach'`,
        [errDetail]
      );
    } catch (_) {}
    if (runId) {
      try { await query(`UPDATE scheduler_runs SET status='failed', detail=$1, finished_at=NOW() WHERE id=$2`, [errDetail, runId]); } catch (_) {}
    }
    throw err;
  }
}

function start() {
  if (process.env.OUTREACH_ENABLED !== 'true') {
    console.log('[OUTREACH] Disabled (set OUTREACH_ENABLED=true to activate)');
    return;
  }

  // Every hour from 9am–5pm CT, weekdays. Catches follow-ups that come due
  // during the business day instead of missing them with a single daily fire.
  job = cron.schedule('0 9-17 * * 1-5', async () => {
    console.log('[OUTREACH] Cron triggered — processing due follow-ups...');
    try {
      await processDueFollowups();
    } catch (err) {
      console.error('[OUTREACH] Cron tick failed:', err.message);
      try {
        require('./pushover.client').sendSchedulerFailure({ scheduler: 'Outreach (Follow-ups)', error: err.message }).catch(() => {});
      } catch (_) {}
    }
  }, { timezone: 'America/Chicago' });

  console.log('[OUTREACH] Cron scheduled — weekdays hourly 9am–5pm CT');
}

function stop() {
  if (job) {
    job.stop();
    job = null;
    console.log('[OUTREACH] Cron stopped');
  }
}

module.exports = { start, stop, processDueFollowups };
