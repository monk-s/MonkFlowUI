const cron = require('node-cron');

let job = null;

function start() {
  if (process.env.OUTREACH_ENABLED !== 'true') {
    console.log('[OUTREACH] Disabled (set OUTREACH_ENABLED=true to activate)');
    return;
  }

  // Run at 9:00 AM Central Time, weekdays only
  job = cron.schedule('0 9 * * 1-5', async () => {
    console.log('[OUTREACH] Cron triggered — processing due follow-ups...');
    try {
      const { query } = require('../config/database');
      const { sendEmail } = require('./email.service');
      const env = require('../config/env');
      const { generateFollowup } = require('./outreach-ai.service');

      // OOO detection patterns
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

      function isAutoReply(text) {
        return OOO_PATTERNS.some(p => p.test(text));
      }

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
          case 2: return addBusinessDays(from, 4);
          case 3: return addBusinessDays(from, 5);
          default: return null;
        }
      }

      // Static fallback templates (used when AI generation fails)
      const { getFirstName, cleanCompanyName } = require('../utils/nameParser');
      function getFollowupTemplate(touchNumber, lead) {
        const firstName = getFirstName(lead.contact_name, lead.contact_email);
        const rawCompany = lead.company ? cleanCompanyName(lead.company) : '';
        const company = rawCompany ? ` at ${rawCompany}` : '';
        const origSubject = lead.original_subject || lead.ai_email_subject || 'your business';
        const reSubject = `Re: ${origSubject}`;

        const unsubToken = lead.unsubscribe_token;
        const unsubUrl = unsubToken ? `https://getmonkflow.com/api/v1/leadgen/unsubscribe/${unsubToken}` : null;
        const unsubFooter = unsubUrl
          ? `<div style="margin-top:20px;font-size:11px;color:#999;"><p><a href="${unsubUrl}" style="color:#999;">Unsubscribe</a></p></div>`
          : '';
        // Tracking pixel for open detection
        const trackingPixel = unsubToken
          ? `<img src="https://getmonkflow.com/api/v1/outreach/track/open/${unsubToken}" width="1" height="1" style="display:none" alt="" />`
          : '';

        const bookingUrl = env.bookingUrl || 'https://monkflow.io/#schedule';
        switch (touchNumber) {
          case 2: return {
            subject: reSubject,
            body: `<div style="font-family:sans-serif;max-width:600px;"><p>Hey ${firstName},</p><p>Quick example of what I mean — we built a client onboarding system for a financial services firm that cut their new-client setup from 45 minutes to under 5. Contracts, CRM sync, everything automated.</p><p>Curious if${rawCompany ? ` ${rawCompany}` : ' your team'} deals with anything similar on the operations side? Happy to walk you through it — <a href="${bookingUrl}">grab 15 min here</a>.</p><p>Nathan</p></div>${unsubFooter}${trackingPixel}`,
          };
          case 3: return {
            subject: `${rawCompany || firstName} + automation`,
            body: `<div style="font-family:sans-serif;max-width:600px;"><p>Hey ${firstName},</p><p>No worries if the timing isn't right — figured I'd leave you with something useful either way.</p><p>Based on what I saw on${rawCompany ? ` ${rawCompany}'s` : ' your'} site, there are a couple of quick automation wins that could free up real hours each week. If you're curious, happy to share over a quick call — <a href="${bookingUrl}">here's my calendar</a>.</p><p>Nathan</p></div>${unsubFooter}${trackingPixel}`,
          };
          case 4: return {
            subject: reSubject,
            body: `<div style="font-family:sans-serif;max-width:600px;"><p>Hey ${firstName},</p><p>Last note from me — going to assume the timing isn't right, and that's totally fine.</p><p>If automating any part of${rawCompany ? ` ${rawCompany}'s` : ' your'} operations ever moves up the priority list, <a href="${bookingUrl}">my calendar's here</a>. Wishing you a great rest of the quarter.</p><p>Nathan</p></div>${unsubFooter}${trackingPixel}`,
          };
          default: return null;
        }
      }

      // Format AI-generated follow-up body into HTML with unsubscribe footer
      function formatFollowupHtml(body, lead) {
        const unsubToken = lead.unsubscribe_token;
        const unsubUrl = unsubToken ? `https://getmonkflow.com/api/v1/leadgen/unsubscribe/${unsubToken}` : null;
        const unsubFooter = unsubUrl
          ? `<div style="margin-top:20px;font-size:11px;color:#999;"><p><a href="${unsubUrl}" style="color:#999;">Unsubscribe</a></p></div>`
          : '';

        // Tracking pixel (uses unsubscribe_token as stable ID, looked up in /track/open endpoint)
        // Use sending domain for tracking pixel so URLs match From domain (avoids spam filters)
        const trackingPixel = lead.unsubscribe_token
          ? `<img src="https://getmonkflow.com/api/v1/outreach/track/open/${lead.unsubscribe_token}" width="1" height="1" style="display:none" alt="" />`
          : '';

        const htmlBody = `<div style="font-family:sans-serif;max-width:600px;">${body.split('\n').map(line =>
          line.trim() ? `<p style="margin:0 0 12px;">${line}</p>` : ''
        ).join('')}</div>${unsubFooter}${trackingPixel}`;

        return htmlBody;
      }

      // Get due leads (include threading data + metadata for AI personalization)
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

      for (const lead of dueLeads) {
        // Populate original_subject from DB if not yet set on the row
        if (!lead.original_subject && lead.first_subject) {
          lead.original_subject = lead.first_subject;
        }

        const nextTouch = lead.touch_count + 1;

        // Try AI-personalized follow-up first, fall back to static templates
        let template;
        try {
          const aiResult = await generateFollowup(lead, nextTouch);
          template = {
            subject: aiResult.subject,
            body: formatFollowupHtml(aiResult.body, lead),
          };
          aiGenerated++;
          // Rate limit AI calls — 1.5s delay between
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
          // Build threading + anti-spam headers
          const replyTo = process.env.LEADGEN_REPLY_TO || 'nathan@mail.getmonkflow.com';
          const messageId = lead.original_message_id || lead.first_message_id;
          const emailHeaders = { 'Reply-To': replyTo };

          // Proper RFC 5322 threading — prevents fake-Re: spam detection
          if (messageId) {
            const threadRef = messageId.includes('<') ? messageId : `<${messageId}>`;
            emailHeaders['In-Reply-To'] = threadRef;
            emailHeaders['References'] = threadRef;
          }

          // List-Unsubscribe for one-click unsubscribe (Gmail/Yahoo requirement)
          const unsubToken = lead.unsubscribe_token;
          if (unsubToken) {
            const unsubUrl = `https://getmonkflow.com/api/v1/leadgen/unsubscribe/${unsubToken}`;
            emailHeaders['List-Unsubscribe'] = `<${unsubUrl}>`;
            emailHeaders['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
          }

          // Strip HTML for plain-text alternative (improves deliverability)
          const plainText = template.body
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/p>/gi, '\n\n')
            .replace(/<[^>]+>/g, '')
            .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
            .replace(/\n{3,}/g, '\n\n')
            .trim();

          const emailResult = await sendEmail({
            from: env.outreachFromEmail,
            to: lead.contact_email,
            subject: template.subject,
            html: template.body,
            text: plainText,
            headers: emailHeaders,
          });

          const gmailId = emailResult?.data?.id || emailResult?.id || null;

          await query(
            `INSERT INTO outreach_emails (lead_id, touch_number, subject, body, gmail_message_id)
             VALUES ($1, $2, $3, $4, $5)`,
            [lead.id, nextTouch, template.subject, template.body, gmailId]
          );

          const nextFollowup = getNextFollowupDate(nextTouch);
          if (nextTouch >= 4) {
            // Sequence complete after touch 4 — close the lead
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
          errors++;
        }
      }

      console.log(`[OUTREACH] Done: ${sent} sent (${aiGenerated} AI-generated), ${completed} completed, ${errors} errors`);
    } catch (err) {
      console.error('[OUTREACH] Cron FAILED:', err.message, err.stack);
    }
  }, { timezone: 'America/Chicago' });

  console.log('[OUTREACH] Cron scheduled — weekdays at 9:00 AM CT');
}

function stop() {
  if (job) {
    job.stop();
    job = null;
    console.log('[OUTREACH] Cron stopped');
  }
}

module.exports = { start, stop };
