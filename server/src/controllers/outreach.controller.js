const catchAsync = require('../utils/catchAsync');
const { query } = require('../config/database');
const ApiError = require('../utils/ApiError');
const env = require('../config/env');
const { sendEmail } = require('../services/email.service');
const outreachAI = require('../services/outreach-ai.service');
const { processInboundReply } = require('../services/reply-detector.service');
const { getFirstName, cleanCompanyName } = require('../utils/nameParser');

// ── Follow-up templates ────────────────────────────────────
// Touch 1 = original cold email (sent manually / externally)
// Touch 2 = Day 3 bump
// Touch 3 = Day 7 value-add
// Touch 4 = Day 14 breakup

function getFollowupTemplate(touchNumber, lead) {
  const firstName = getFirstName(lead.contact_name, lead.contact_email);
  const rawCompany = lead.company ? cleanCompanyName(lead.company) : '';
  const company = rawCompany ? ` at ${rawCompany}` : '';
  // Use original subject from touch 1 for proper threading
  const origSubject = lead.original_subject || lead.ai_email_subject || 'your business';
  const reSubject = `Re: ${origSubject}`;

  const unsubToken = lead.unsubscribe_token;
  // Use sending domain (getmonkflow.com) for unsub links — must match From domain to avoid spam filters
  const unsubUrl = unsubToken ? `https://monkflow.io/api/v1/leadgen/unsubscribe/${unsubToken}` : null;
  const unsubFooter = unsubUrl
    ? `<div style="margin-top:20px;font-size:11px;color:#999;"><p><a href="${unsubUrl}" style="color:#999;">Unsubscribe</a></p></div>`
    : '';
  // Tracking pixel for open detection
  const trackingPixel = unsubToken
    ? `<img src="https://monkflow.io/api/v1/outreach/track/open/${unsubToken}" width="1" height="1" style="display:none" alt="" />`
    : '';

  switch (touchNumber) {
    case 2:
      return {
        subject: reSubject,
        body: `<div style="font-family:sans-serif;max-width:600px;">
          <p>Hey ${firstName},</p>
          <p>Quick example of what I mean — we built a client onboarding system for a financial services firm that cut their new-client setup from 45 minutes to under 5. Contracts, CRM sync, everything automated.</p>
          <p>Curious if${rawCompany ? ` ${rawCompany}` : ' your team'} deals with anything similar on the operations side? Happy to walk you through it — <a href="${env.bookingUrl}">grab 15 min here</a>.</p>
          <p>Nathan</p>
        </div>${unsubFooter}${trackingPixel}`,
      };
    case 3:
      return {
        subject: `${rawCompany || firstName} + automation`,
        body: `<div style="font-family:sans-serif;max-width:600px;">
          <p>Hey ${firstName},</p>
          <p>No worries if the timing isn't right — figured I'd leave you with something useful either way.</p>
          <p>Based on what I saw on${rawCompany ? ` ${rawCompany}'s` : ' your'} site, there are a couple of quick automation wins that could free up real hours each week. If you're curious, happy to share over a quick call — <a href="${env.bookingUrl}">here's my calendar</a>.</p>
          <p>Nathan</p>
        </div>${unsubFooter}${trackingPixel}`,
      };
    case 4:
      return {
        subject: reSubject,
        body: `<div style="font-family:sans-serif;max-width:600px;">
          <p>Hey ${firstName},</p>
          <p>Last note from me — going to assume the timing isn't right, and that's totally fine.</p>
          <p>If automating any part of${rawCompany ? ` ${rawCompany}'s` : ' your'} operations ever moves up the priority list, <a href="${env.bookingUrl}">my calendar's here</a>. Wishing you a great rest of the quarter.</p>
          <p>Nathan</p>
        </div>${unsubFooter}${trackingPixel}`,
      };
    default:
      return null;
  }
}

// Calculate next follow-up date (business days only)
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

function getNextFollowupDate(touchCount, lastSentAt) {
  const from = lastSentAt ? new Date(lastSentAt) : new Date();
  switch (touchCount) {
    case 0: return addBusinessDays(from, 3);  // After initial: 3 business days
    case 1: return addBusinessDays(from, 3);  // After touch 1 (initial): 3 biz days → touch 2
    case 2: return addBusinessDays(from, 4);  // After touch 2: +4 biz days (~Day 7)
    case 3: return addBusinessDays(from, 5);  // After touch 3: +5 biz days (~Day 14)
    default: return null; // Sequence complete after touch 4
  }
}

// ── OOO / auto-reply detection ─────────────────────────────
const OOO_PATTERNS = [
  /out of (the )?office/i,
  /auto[- ]?reply/i,
  /automatic reply/i,
  /away from (my )?desk/i,
  /on (annual |paid )?leave/i,
  /on vacation/i,
  /on holiday/i,
  /currently (out|away|unavailable)/i,
  /will (be back|return|respond|get back)/i,
  /limited access to email/i,
  /thank you for (your )?(email|message|reaching out).*will (get back|respond|reply)/i,
  /i('m| am) (currently )?(out|away|traveling|travelling)/i,
];

function isAutoReply(subject, body) {
  const text = `${subject || ''} ${body || ''}`.toLowerCase();
  return OOO_PATTERNS.some(p => p.test(text));
}

// ── CRUD Endpoints ─────────────────────────────────────────

const createLead = catchAsync(async (req, res) => {
  const { contact_name, contact_email, company, notes, initial_email_date, priority } = req.body;
  if (!contact_name || !contact_email) {
    throw ApiError.badRequest('Contact name and email are required');
  }

  // Verify email before adding
  const verification = await outreachAI.verifyEmail(contact_email);
  if (!verification.valid) {
    throw ApiError.badRequest(`Invalid email: ${verification.reason}`);
  }

  // Touch 0 = initial cold email (already sent), so we set touch_count=1
  const sentDate = initial_email_date ? new Date(initial_email_date) : new Date();
  const nextFollowup = getNextFollowupDate(1, sentDate);

  const { rows } = await query(
    `INSERT INTO outreach_leads (contact_name, contact_email, company, notes, touch_count, last_sent_at, next_followup_at, priority)
     VALUES ($1, $2, $3, $4, 1, $5, $6, $7) RETURNING *`,
    [contact_name, contact_email, company || null, notes || null, sentDate, nextFollowup, priority || false]
  );

  res.status(201).json({ data: rows[0], message: 'Lead added to sequence' });
});

const getLeads = catchAsync(async (req, res) => {
  const { status, priority, search, page = 1, limit = 50 } = req.query;
  const pg = parseInt(page);
  const lim = parseInt(limit);
  const offset = (pg - 1) * lim;

  const conditions = [];
  const params = [];

  if (status) {
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }
  if (priority === 'true') {
    conditions.push('priority = true');
  }
  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    conditions.push(`(LOWER(contact_name) LIKE $${params.length} OR LOWER(contact_email) LIKE $${params.length} OR LOWER(company) LIKE $${params.length})`);
  }

  const whereSql = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';

  const [dataResult, countResult] = await Promise.all([
    query(
      `SELECT * FROM outreach_leads${whereSql} ORDER BY next_followup_at ASC NULLS LAST, created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, lim, offset]
    ),
    query(
      `SELECT COUNT(*)::int as total FROM outreach_leads${whereSql}`,
      params
    ),
  ]);

  const total = countResult.rows[0].total;
  res.json({
    data: dataResult.rows,
    pagination: { page: pg, limit: lim, total, totalPages: Math.ceil(total / lim) },
  });
});

const getLead = catchAsync(async (req, res) => {
  const [leadResult, emailsResult] = await Promise.all([
    query('SELECT * FROM outreach_leads WHERE id = $1', [req.params.id]),
    query('SELECT * FROM outreach_emails WHERE lead_id = $1 ORDER BY touch_number ASC', [req.params.id]),
  ]);

  if (!leadResult.rows[0]) throw ApiError.notFound('Lead not found');

  res.json({
    data: {
      ...leadResult.rows[0],
      emails: emailsResult.rows,
    },
  });
});

const updateLead = catchAsync(async (req, res) => {
  const { contact_name, contact_email, company, notes, status, priority } = req.body;
  const { rows } = await query(
    `UPDATE outreach_leads
     SET contact_name = COALESCE($1, contact_name),
         contact_email = COALESCE($2, contact_email),
         company = COALESCE($3, company),
         notes = COALESCE($4, notes),
         status = COALESCE($5, status),
         priority = COALESCE($6, priority),
         updated_at = NOW()
     WHERE id = $7 RETURNING *`,
    [contact_name, contact_email, company, notes, status, priority, req.params.id]
  );

  if (!rows[0]) throw ApiError.notFound('Lead not found');
  res.json({ data: rows[0] });
});

const deleteLead = catchAsync(async (req, res) => {
  const { rows } = await query('DELETE FROM outreach_leads WHERE id = $1 RETURNING id', [req.params.id]);
  if (!rows[0]) throw ApiError.notFound('Lead not found');
  res.json({ message: 'Lead removed from sequence' });
});

// ── Stats ──────────────────────────────────────────────────

const getStats = catchAsync(async (req, res) => {
  const { rows } = await query(`
    SELECT
      COUNT(*)::int as total,
      COUNT(*) FILTER (WHERE status = 'active')::int as active,
      COUNT(*) FILTER (WHERE status = 'replied')::int as replied,
      COUNT(*) FILTER (WHERE status = 'closed')::int as closed,
      COUNT(*) FILTER (WHERE next_followup_at <= NOW() AND status = 'active')::int as due_now,
      COUNT(*) FILTER (WHERE priority = true)::int as priority_count
    FROM outreach_leads
  `);
  res.json({ data: rows[0] });
});

// ── Mark reply ─────────────────────────────────────────────

const markReply = catchAsync(async (req, res) => {
  const { is_ooo, reply_snippet } = req.body;
  const ooo = is_ooo || isAutoReply(reply_snippet || '', reply_snippet || '');

  if (ooo) {
    // OOO — keep in sequence, just note it
    const { rows } = await query(
      `UPDATE outreach_leads
       SET reply_is_ooo = true, notes = COALESCE(notes, '') || E'\n[OOO auto-reply detected]', updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    res.json({ data: rows[0], message: 'OOO detected — lead stays in sequence' });
  } else {
    // Real reply — stop sequence
    const { rows } = await query(
      `UPDATE outreach_leads
       SET status = 'replied', replied_at = NOW(), next_followup_at = NULL, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    res.json({ data: rows[0], message: 'Lead marked as replied — sequence stopped' });
  }
});

// ── Process due follow-ups ─────────────────────────────────

const processDueFollowups = catchAsync(async (req, res) => {
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

  const results = { sent: 0, skipped: 0, completed: 0, errors: [] };

  for (const lead of dueLeads) {
    if (!lead.original_subject && lead.first_subject) {
      lead.original_subject = lead.first_subject;
    }

    const nextTouch = lead.touch_count + 1;
    const template = getFollowupTemplate(nextTouch, lead);

    if (!template) {
      // Sequence complete
      await query(
        `UPDATE outreach_leads SET status = 'closed', next_followup_at = NULL, updated_at = NOW() WHERE id = $1`,
        [lead.id]
      );
      results.completed++;
      continue;
    }

    try {
      // Build threading + anti-spam headers
      const replyTo = process.env.LEADGEN_REPLY_TO || 'nathan@mail.getmonkflow.com';
      const messageId = lead.original_message_id || lead.first_message_id;
      const emailHeaders = { 'Reply-To': replyTo };

      if (messageId) {
        const threadRef = messageId.includes('<') ? messageId : `<${messageId}>`;
        emailHeaders['In-Reply-To'] = threadRef;
        emailHeaders['References'] = threadRef;
      }

      const unsubToken = lead.unsubscribe_token;
      if (unsubToken) {
        const unsubUrl = `${env.frontendUrl || 'https://getmonkflow.com'}/api/v1/leadgen/unsubscribe/${unsubToken}`;
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

      const emailResult = await sendEmail({
        from: env.outreachFromEmail,
        to: lead.contact_email,
        subject: template.subject,
        html: template.body,
        text: plainText,
        headers: emailHeaders,
      });

      const gmailId = emailResult?.data?.id || emailResult?.id || null;

      // Record the email
      await query(
        `INSERT INTO outreach_emails (lead_id, touch_number, subject, body, gmail_message_id, variant, delivered_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [lead.id, nextTouch, template.subject, template.body, gmailId, lead.email_variant || 'B']
      );

      // Update lead — close sequence after touch 4
      const nextFollowup = getNextFollowupDate(nextTouch, new Date());
      if (nextTouch >= 4) {
        await query(
          `UPDATE outreach_leads SET touch_count = $1, last_sent_at = NOW(), next_followup_at = NULL, status = 'closed', updated_at = NOW() WHERE id = $2`,
          [nextTouch, lead.id]
        );
        results.completed++;
      } else {
        await query(
          `UPDATE outreach_leads SET touch_count = $1, last_sent_at = NOW(), next_followup_at = $2, updated_at = NOW() WHERE id = $3`,
          [nextTouch, nextFollowup, lead.id]
        );
      }

      results.sent++;
    } catch (err) {
      results.errors.push({ lead_id: lead.id, email: lead.contact_email, error: err.message });
    }
  }

  res.json({ data: results, message: `Processed ${dueLeads.length} leads: ${results.sent} sent, ${results.completed} completed` });
});

// ── Send preview (dry run) ─────────────────────────────────

const previewFollowup = catchAsync(async (req, res) => {
  const { rows } = await query('SELECT * FROM outreach_leads WHERE id = $1', [req.params.id]);
  if (!rows[0]) throw ApiError.notFound('Lead not found');

  const lead = rows[0];
  const nextTouch = lead.touch_count + 1;
  const template = getFollowupTemplate(nextTouch, lead);

  if (!template) {
    return res.json({ data: null, message: 'Sequence complete — no more follow-ups' });
  }

  res.json({
    data: {
      touch_number: nextTouch,
      to: lead.contact_email,
      subject: template.subject,
      body: template.body,
    },
  });
});

// ── Bulk import ────────────────────────────────────────────

const bulkImport = catchAsync(async (req, res) => {
  const { leads } = req.body;
  if (!Array.isArray(leads) || leads.length === 0) {
    throw ApiError.badRequest('leads array is required');
  }
  if (leads.length > 1000) {
    throw ApiError.badRequest('Maximum 1000 leads per import. Split larger lists into multiple batches.');
  }

  let imported = 0;
  let skipped = 0;

  for (const lead of leads) {
    if (!lead.contact_name || !lead.contact_email) {
      skipped++;
      continue;
    }

    // Skip duplicates
    const { rows: existing } = await query(
      'SELECT id FROM outreach_leads WHERE contact_email = $1',
      [lead.contact_email]
    );
    if (existing.length > 0) {
      skipped++;
      continue;
    }

    const sentDate = lead.initial_email_date ? new Date(lead.initial_email_date) : new Date();
    const nextFollowup = getNextFollowupDate(1, sentDate);

    await query(
      `INSERT INTO outreach_leads (contact_name, contact_email, company, notes, touch_count, last_sent_at, next_followup_at)
       VALUES ($1, $2, $3, $4, 1, $5, $6)`,
      [lead.contact_name, lead.contact_email, lead.company || null, lead.notes || null, sentDate, nextFollowup]
    );
    imported++;
  }

  res.status(201).json({
    data: { imported, skipped, total: leads.length },
    message: `Imported ${imported} leads, skipped ${skipped}`,
  });
});

// ── Priority toggle ────────────────────────────────────────

const togglePriority = catchAsync(async (req, res) => {
  const { rows } = await query(
    `UPDATE outreach_leads SET priority = NOT COALESCE(priority, false), updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [req.params.id]
  );
  if (!rows[0]) throw ApiError.notFound('Lead not found');
  res.json({ data: rows[0], message: rows[0].priority ? 'Marked as priority' : 'Removed from priority' });
});

// ── AI email endpoints ─────────────────────────────────────

const generateAiEmail = catchAsync(async (req, res) => {
  const result = await outreachAI.generateForLead(req.params.id);
  res.json({ data: result, message: 'AI email generated' });
});

const generateAllAiEmails = catchAsync(async (req, res) => {
  const results = await outreachAI.generateForAllPriority();
  res.json({ data: results, message: `Generated ${results.generated} AI emails` });
});

const previewAiEmail = catchAsync(async (req, res) => {
  const { rows } = await query('SELECT ai_email_subject, ai_email_body, ai_email_generated_at, ai_email_sent_at FROM outreach_leads WHERE id = $1', [req.params.id]);
  if (!rows[0]) throw ApiError.notFound('Lead not found');
  if (!rows[0].ai_email_body) throw ApiError.badRequest('No AI email generated yet');
  res.json({ data: rows[0] });
});

const sendAiEmailEndpoint = catchAsync(async (req, res) => {
  const result = await outreachAI.sendAiEmail(req.params.id);
  res.json({ data: result, message: 'AI email sent' });
});

// ── Resend bounce/complaint webhook ────────────────────────

// ── Open/Click Tracking Endpoints ─────────────────────────

// 1x1 transparent GIF pixel
const TRACKING_PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

const trackOpen = catchAsync(async (req, res) => {
  const { emailId } = req.params;
  if (emailId) {
    // Filter out spam scanner opens — they fire within seconds of delivery
    // and produce fake open data that makes diagnostics impossible.
    const ua = (req.headers['user-agent'] || '').toLowerCase();
    const isScanner = !ua
      || ua.length < 20
      || /barracuda|mimecast|proofpoint|symantec|forefront|microsoft office|outlook-scan|google-safety|postfix|mailscanner|spamassassin|clamav|amavis|rspamd|messagelabs/.test(ua);

    if (!isScanner) {
      // Only record opens from likely-human clients
      await query(
        `UPDATE outreach_leads SET opened_at = COALESCE(opened_at, NOW()), updated_at = NOW()
         WHERE id = (SELECT lead_id FROM outreach_emails WHERE gmail_message_id = $1 OR id::text = $1 LIMIT 1)
            OR unsubscribe_token::text = $1`,
        [emailId]
      ).catch(() => {});

      await query(
        `UPDATE outreach_emails SET opened_at = COALESCE(opened_at, NOW())
         WHERE gmail_message_id = $1 OR id::text = $1`,
        [emailId]
      ).catch(() => {});
    }
  }
  // Always serve the pixel regardless of scanner detection
  res.set({ 'Content-Type': 'image/gif', 'Cache-Control': 'no-cache, no-store', 'Expires': '0' });
  res.send(TRACKING_PIXEL);
});

const trackClick = catchAsync(async (req, res) => {
  const { emailId } = req.params;
  const targetUrl = req.query.url;

  if (emailId) {
    await query(
      `UPDATE outreach_leads SET clicked_at = COALESCE(clicked_at, NOW()), updated_at = NOW()
       WHERE id = (SELECT lead_id FROM outreach_emails WHERE gmail_message_id = $1 OR id::text = $1 LIMIT 1)
          OR unsubscribe_token::text = $1`,
      [emailId]
    ).catch(() => {});
  }

  // Validate URL to prevent open redirect attacks
  if (targetUrl) {
    try {
      const parsed = new URL(targetUrl);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        res.redirect(302, targetUrl);
      } else {
        res.redirect(302, 'https://getmonkflow.com');
      }
    } catch {
      res.redirect(302, 'https://getmonkflow.com');
    }
  } else {
    res.redirect(302, 'https://getmonkflow.com');
  }
});

// ── Outreach Analytics Endpoint ──────���────────────────────

const getAnalytics = catchAsync(async (req, res) => {
  const days = parseInt(req.query.days, 10) || 30;
  const since = new Date();
  since.setDate(since.getDate() - days);

  // Funnel stats
  const { rows: [funnel] } = await query(
    `SELECT
       COUNT(*) AS total_leads,
       COUNT(*) FILTER (WHERE touch_count >= 1) AS emails_sent,
       COUNT(*) FILTER (WHERE opened_at IS NOT NULL) AS emails_opened,
       COUNT(*) FILTER (WHERE clicked_at IS NOT NULL) AS emails_clicked,
       COUNT(*) FILTER (WHERE replied_at IS NOT NULL OR status = 'replied') AS replies_received,
       COUNT(*) FILTER (WHERE status = 'replied') AS positive_replies,
       COUNT(*) FILTER (WHERE status = 'closed' AND notes LIKE '%converted%') AS clients_closed
     FROM outreach_leads
     WHERE created_at >= $1`,
    [since]
  );

  // Daily trend (JOIN to outreach_leads for opened_at / replied_at)
  const { rows: dailyTrend } = await query(
    `SELECT
       date_trunc('day', oe.sent_at)::date AS date,
       COUNT(*) AS sent,
       COUNT(*) FILTER (WHERE ol.opened_at IS NOT NULL) AS opened,
       COUNT(*) FILTER (WHERE oe.reply_received_at IS NOT NULL) AS replied
     FROM outreach_emails oe
     JOIN outreach_leads ol ON ol.id = oe.lead_id
     WHERE oe.sent_at >= $1
     GROUP BY date_trunc('day', oe.sent_at)::date
     ORDER BY date`,
    [since]
  );

  // By industry breakdown
  const { rows: byIndustry } = await query(
    `SELECT
       COALESCE(industry, 'unknown') AS industry,
       COUNT(*) AS sent,
       ROUND(COUNT(*) FILTER (WHERE status = 'replied')::numeric / NULLIF(COUNT(*), 0) * 100, 1) AS reply_rate
     FROM outreach_leads
     WHERE created_at >= $1
     GROUP BY industry
     ORDER BY sent DESC
     LIMIT 15`,
    [since]
  );

  // By touch number (use reply_received_at which exists on outreach_emails)
  const { rows: byTouch } = await query(
    `SELECT
       touch_number,
       COUNT(*) AS sent,
       COUNT(*) FILTER (WHERE reply_received_at IS NOT NULL) AS replied,
       ROUND(COUNT(*) FILTER (WHERE reply_received_at IS NOT NULL)::numeric / NULLIF(COUNT(*), 0) * 100, 1) AS reply_rate
     FROM outreach_emails
     WHERE sent_at >= $1
     GROUP BY touch_number
     ORDER BY touch_number`,
    [since]
  );

  // Sender health (last 7 days)
  const { rows: senderHealth } = await query(
    `SELECT
       sender_email,
       SUM(sent_count) AS sent_7d,
       ROUND(SUM(bounce_count)::numeric / NULLIF(SUM(sent_count), 0) * 100, 1) AS bounce_rate,
       ROUND(SUM(complaint_count)::numeric / NULLIF(SUM(sent_count), 0) * 100, 1) AS complaint_rate
     FROM sender_health
     WHERE date >= CURRENT_DATE - INTERVAL '7 days'
     GROUP BY sender_email
     ORDER BY sent_7d DESC`
  );

  // Emails per lead (for the sidebar detail view)
  const { rows: recentEmails } = await query(
    `SELECT oe.*, ol.contact_name, ol.company
     FROM outreach_emails oe
     JOIN outreach_leads ol ON ol.id = oe.lead_id
     WHERE oe.sent_at >= $1
     ORDER BY oe.sent_at DESC
     LIMIT 50`,
    [since]
  );

  res.json({
    period: { start: since.toISOString(), end: new Date().toISOString(), days },
    funnel,
    dailyTrend,
    byIndustry,
    byTouch,
    senderHealth,
    recentEmails,
  });
});

// ── A/B Testing Results ──────────────────────────────────

const getAbResults = catchAsync(async (req, res) => {
  const VARIANT_LABELS = {
    A: 'A — Insight Lead (retired)',
    B: 'B — Question Lead (retired)',
    C: 'C — Loom Bait',
    D: 'D — Teardown Offer',
    E: 'E — Sharp Question',
    F: 'F — Cost of Inaction',
  };
  const { rows } = await query(`
    SELECT
      ol.email_variant AS variant,
      COUNT(*) AS sent,
      COUNT(*) FILTER (WHERE ol.opened_at IS NOT NULL) AS opened,
      COUNT(*) FILTER (WHERE ol.replied_at IS NOT NULL OR ol.status = 'replied') AS replied,
      COUNT(*) FILTER (WHERE ol.reply_sentiment = 'positive') AS positive,
      ROUND(COUNT(*) FILTER (WHERE ol.opened_at IS NOT NULL)::numeric / NULLIF(COUNT(*), 0) * 100, 1) AS open_rate,
      ROUND(COUNT(*) FILTER (WHERE ol.replied_at IS NOT NULL OR ol.status = 'replied')::numeric / NULLIF(COUNT(*), 0) * 100, 1) AS reply_rate
    FROM outreach_leads ol
    WHERE ol.touch_count >= 1
      AND ol.email_variant IN ('A', 'B', 'C', 'D', 'E', 'F')
    GROUP BY ol.email_variant
    ORDER BY variant
  `);
  const data = rows.map(r => ({ ...r, label: VARIANT_LABELS[r.variant] || r.variant }));
  res.json({ data });
});

// ── Lead email timeline (for sidebar) ─────────────────────

const getLeadTimeline = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { rows: emails } = await query(
    `SELECT id, touch_number, subject, gmail_message_id, sent_at, opened_at, replied_at
     FROM outreach_emails
     WHERE lead_id = $1
     ORDER BY touch_number ASC`,
    [id]
  );
  res.json(emails);
});

// ── Inbound Reply Webhook ─────────────────────────────────

const handleInboundReply = catchAsync(async (req, res) => {
  // Verify webhook secret to prevent unauthorized access (mandatory)
  const webhookSecret = process.env.INBOUND_WEBHOOK_SECRET || env.inboundWebhookSecret;
  const providedSecret = req.headers['x-webhook-secret'] || req.query.secret;
  if (!webhookSecret || providedSecret !== webhookSecret) {
    return res.status(401).json({ error: 'Invalid or missing webhook secret' });
  }

  const { from, subject, body, headers, text } = req.body;

  if (!from) {
    throw ApiError.badRequest('from field is required');
  }

  // Extract In-Reply-To from headers (support object or string)
  let inReplyTo = null;
  if (headers) {
    if (typeof headers === 'object') {
      inReplyTo = headers['In-Reply-To'] || headers['in-reply-to'] || null;
    } else if (typeof headers === 'string') {
      const match = headers.match(/In-Reply-To:\s*(.+)/i);
      if (match) inReplyTo = match[1].trim();
    }
  }

  const replyBody = body || text || '';
  if (!replyBody) {
    throw ApiError.badRequest('body or text field is required');
  }

  const result = await processInboundReply({
    from,
    to: req.body.to || null,
    subject: subject || '',
    body: replyBody,
    inReplyTo,
  });

  if (!result.matched) {
    return res.status(404).json({ matched: false, reason: result.reason });
  }

  res.json({ data: result });
});

// ── Resend Webhook ────────────────────────────────────────

const handleResendWebhook = catchAsync(async (req, res) => {
  const { type, data } = req.body;
  const { trackBounce, trackComplaint } = require('../services/leadgen.service');

  // Handle delivery tracking
  if (type === 'email.delivered') {
    const emailId = data?.email_id;
    if (emailId) {
      await query(
        `UPDATE outreach_emails SET delivered_at = COALESCE(delivered_at, NOW())
         WHERE gmail_message_id = $1`,
        [emailId]
      ).catch(err => console.error('[OUTREACH] Failed to track delivery:', err.message));
    }
  }

  // Handle open tracking (backup — pixel tracking is primary)
  if (type === 'email.opened') {
    const emailId = data?.email_id;
    if (emailId) {
      await query(
        `UPDATE outreach_emails SET opened_at = COALESCE(opened_at, NOW())
         WHERE gmail_message_id = $1`,
        [emailId]
      ).catch(() => {});
      await query(
        `UPDATE outreach_leads SET opened_at = COALESCE(opened_at, NOW()), updated_at = NOW()
         WHERE id = (SELECT lead_id FROM outreach_emails WHERE gmail_message_id = $1 LIMIT 1)`,
        [emailId]
      ).catch(() => {});
    }
  }

  // Resend webhook events: email.bounced, email.complained, email.delivered
  if (type === 'email.bounced' || type === 'email.complained') {
    const toEmail = data?.to?.[0] || data?.email_id;
    const fromEmail = data?.from;

    if (toEmail) {
      // Find the lead and remove from active sequence
      const { rows } = await query(
        `UPDATE outreach_leads
         SET status = 'closed',
             next_followup_at = NULL,
             notes = COALESCE(notes, '') || $2,
             updated_at = NOW()
         WHERE contact_email = $1 AND status = 'active'
         RETURNING id, contact_email`,
        [toEmail, `\n[Auto-removed: ${type} on ${new Date().toISOString().split('T')[0]}]`]
      );

      if (rows.length > 0) {
        console.log(`[OUTREACH] ${type}: removed ${toEmail} from sequence`);
      }

      // Also mark the lead as bounced in leads table (for domain suppression)
      try {
        const { rows: leadRows } = await query(
          `UPDATE leads
           SET status = 'bounced', updated_at = NOW()
           WHERE email = $1 AND status IN ('sent', 'email_generated', 'diagnosed')
           RETURNING id`,
          [toEmail]
        );
        if (leadRows.length > 0) {
          console.log(`[OUTREACH] ${type}: marked lead ${toEmail} as bounced in leads table`);
        }
      } catch (err) {
        console.error(`[OUTREACH] Failed to mark lead as bounced: ${err.message}`);
      }

      // Track sender health
      if (fromEmail) {
        const senderAddr = fromEmail.includes('<') ? fromEmail.match(/<(.+)>/)?.[1] : fromEmail;
        if (senderAddr) {
          if (type === 'email.bounced') await trackBounce(senderAddr);
          if (type === 'email.complained') await trackComplaint(senderAddr);
        }
      }
    }
  }

  // ── Inbound reply via Resend receiving ──────────────────
  if (type === 'email.received') {
    const emailId = data?.email_id;
    if (!emailId) {
      return res.json({ received: true, note: 'no email_id' });
    }

    // Fetch full email content from Resend API (webhook only has metadata)
    try {
      const resendKey = env.resendApiKey;
      if (!resendKey) {
        console.warn('[OUTREACH] email.received but no RESEND_API_KEY — cannot fetch body');
        return res.json({ received: true, note: 'no api key' });
      }

      const fetchRes = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
        headers: { Authorization: `Bearer ${resendKey}` },
      });

      if (!fetchRes.ok) {
        console.error(`[OUTREACH] Failed to fetch received email ${emailId}: ${fetchRes.status}`);
        return res.json({ received: true, note: 'fetch failed' });
      }

      const email = await fetchRes.json();
      const senderFrom = email.from || data.from || '';
      const replyBody = email.html || email.text || '';
      const replySubject = email.subject || data.subject || '';

      if (!senderFrom || !replyBody) {
        console.warn(`[OUTREACH] email.received but missing from/body for ${emailId}`);
        return res.json({ received: true, note: 'missing from or body' });
      }

      // Extract In-Reply-To from email headers
      let inReplyTo = null;
      if (email.headers) {
        if (typeof email.headers === 'object') {
          inReplyTo = email.headers['In-Reply-To'] || email.headers['in-reply-to'] || null;
        }
      }

      console.log(`[OUTREACH] email.received from ${senderFrom} — routing to reply detector`);

      const result = await processInboundReply({
        from: senderFrom,
        to: Array.isArray(email.to) ? email.to[0] : (email.to || null),
        subject: replySubject,
        body: replyBody,
        inReplyTo,
      });

      console.log(`[OUTREACH] Reply processed: matched=${result.matched}, sentiment=${result.sentiment || 'n/a'}`);
    } catch (err) {
      console.error('[OUTREACH] email.received processing error:', err.message);
    }
  }

  // Always respond 200 to acknowledge
  res.json({ received: true });
});

module.exports = {
  createLead,
  getLeads,
  getLead,
  updateLead,
  deleteLead,
  getStats,
  markReply,
  processDueFollowups,
  previewFollowup,
  bulkImport,
  togglePriority,
  generateAiEmail,
  generateAllAiEmails,
  previewAiEmail,
  sendAiEmailEndpoint,
  handleResendWebhook,
  handleInboundReply,
  trackOpen,
  trackClick,
  getAnalytics,
  getAbResults,
  getLeadTimeline,
};
