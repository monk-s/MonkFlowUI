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

      function getFollowupTemplate(touchNumber, lead) {
        const firstName = (lead.contact_name || '').split(' ')[0] || 'there';
        const company = lead.company ? ` at ${lead.company}` : '';
        // Use the original subject from touch 1 for proper threading
        const origSubject = lead.original_subject || lead.ai_email_subject || 'your business';
        const reSubject = `Re: ${origSubject}`;

        const unsubToken = lead.unsubscribe_token;
        const unsubUrl = unsubToken ? `${env.frontendUrl || 'https://getmonkflow.com'}/api/v1/leadgen/unsubscribe/${unsubToken}` : null;
        const unsubFooter = unsubUrl
          ? `<div style="margin-top:20px;font-size:11px;color:#999;"><p><a href="${unsubUrl}" style="color:#999;">Unsubscribe</a></p></div>`
          : '';

        switch (touchNumber) {
          case 2: return {
            subject: reSubject,
            body: `<div style="font-family:sans-serif;max-width:600px;"><p>Hey ${firstName},</p><p>Just floating this back up in case it got buried. Would love to chat if you're open to it.</p><p>Let me know either way — happy to answer any questions.</p><p>Best,<br/>Nathan</p></div>${unsubFooter}`,
          };
          case 3: return {
            subject: reSubject,
            body: `<div style="font-family:sans-serif;max-width:600px;"><p>Hi ${firstName},</p><p>Wanted to share a quick thought — I've been looking at how businesses${company} handle their workflows, and there's usually a lot of room to automate the repetitive stuff.</p><p>If you're curious, I'd be happy to walk through a couple ideas. No pressure at all.</p><p>Cheers,<br/>Nathan</p></div>${unsubFooter}`,
          };
          case 4: return {
            subject: reSubject,
            body: `<div style="font-family:sans-serif;max-width:600px;"><p>Hey ${firstName},</p><p>Totally understand if the timing's off — just didn't want to drop the ball on my end.</p><p>If things change down the road, my door's always open. Wishing you and the team${company} all the best.</p><p>Take care,<br/>Nathan</p></div>${unsubFooter}`,
          };
          default: return null;
        }
      }

      // Get due leads (include threading data for proper In-Reply-To headers)
      const { rows: dueLeads } = await query(
        `SELECT ol.*,
                (SELECT gmail_message_id FROM outreach_emails WHERE lead_id = ol.id ORDER BY touch_number ASC LIMIT 1) AS first_message_id,
                (SELECT subject FROM outreach_emails WHERE lead_id = ol.id ORDER BY touch_number ASC LIMIT 1) AS first_subject
         FROM outreach_leads ol
         WHERE ol.status = 'active'
           AND ol.next_followup_at <= NOW()
           AND ol.touch_count < 4
         ORDER BY ol.next_followup_at ASC`
      );

      let sent = 0, completed = 0, errors = 0;

      for (const lead of dueLeads) {
        // Populate original_subject from DB if not yet set on the row
        if (!lead.original_subject && lead.first_subject) {
          lead.original_subject = lead.first_subject;
        }

        const nextTouch = lead.touch_count + 1;
        const template = getFollowupTemplate(nextTouch, lead);

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
          const replyTo = process.env.LEADGEN_REPLY_TO || 'nate@thelinders.com';
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
            const unsubUrl = `${env.frontendUrl || 'https://getmonkflow.com'}/api/v1/leadgen/unsubscribe/${unsubToken}`;
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
          await query(
            `UPDATE outreach_leads SET touch_count = $1, last_sent_at = NOW(), next_followup_at = $2, updated_at = NOW() WHERE id = $3`,
            [nextTouch, nextFollowup, lead.id]
          );

          sent++;
        } catch (err) {
          console.error(`[OUTREACH] Failed to send to ${lead.contact_email}:`, err.message);
          errors++;
        }
      }

      console.log(`[OUTREACH] Done: ${sent} sent, ${completed} completed, ${errors} errors`);
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
