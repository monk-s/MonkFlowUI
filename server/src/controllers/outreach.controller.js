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
  const rawCompany = lead.company ? cleanCompanyName(lead.company, lead.contact_email) : '';
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
    case 2: return {
      subject: reSubject,
      body: `<div style="font-family:sans-serif;max-width:600px;"><p>Hey ${firstName},</p><p>Came across a stat I thought was relevant — businesses${company} that automate their intake and scheduling processes typically save 10-15 hours per week in front-desk time. Most of that is just eliminating phone tag and manual data entry.</p><p>No agenda — just thought this might be useful as you think about operations.</p><p>Nathan</p></div>${unsubFooter}${trackingPixel}`,
    };
    case 3: return {
      subject: reSubject,
      body: `<div style="font-family:sans-serif;max-width:600px;"><p>Hey ${firstName},</p><p>We just wrapped up an automation build for a financial services firm — cut their client onboarding from 45 minutes to under 5. Contracts, CRM sync, the whole workflow running on autopilot.</p><p>If${rawCompany ? ` ${rawCompany}` : ' your team'} ever wants to explore something similar, happy to walk through what we built — <a href="${env.bookingUrl}">here's my calendar</a>.</p><p>Nathan</p></div>${unsubFooter}${trackingPixel}`,
    };
    case 4: return {
      subject: reSubject,
      body: `<div style="font-family:sans-serif;max-width:600px;"><p>Hey ${firstName},</p><p>Totally get if this isn't a priority right now — no worries at all. If automating any part of${rawCompany ? ` ${rawCompany}'s` : ' your'} operations ever moves up the list, I'm here.</p><p>Wishing you well.</p><p>Nathan</p><p style="font-size:13px;color:#666;">P.S. Calendar's always open: <a href="${env.bookingUrl}">${env.bookingUrl}</a></p></div>${unsubFooter}${trackingPixel}`,
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
    case 0: return addBusinessDays(from, 3);  // After initial: 3 business days → touch 2
    case 1: return addBusinessDays(from, 3);  // After touch 1 (initial): 3 biz days → touch 2
    case 2: return addBusinessDays(from, 5);  // After touch 2: +5 biz days (~Day 8) → touch 3
    case 3: return addBusinessDays(from, 7);  // After touch 3: +7 biz days (~Day 17) → touch 4
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
      const fromMatch = fromAddr && fromAddr.match(/<([^>]+)>/);
      const senderEmail = ((fromMatch ? fromMatch[1] : fromAddr) || '').trim().toLowerCase();

      const emailResult = await sendEmail({
        from: fromAddr,
        to: lead.contact_email,
        subject: template.subject,
        html: template.body,
        text: plainText,
        headers: emailHeaders,
      });

      const gmailId = emailResult?.data?.id || emailResult?.id || null;

      // Track in sender_health so admin deliverability reflects follow-up
      // sends, not just initial leadgen. Keeps Resend ↔ admin in sync.
      if (senderEmail) {
        try {
          const { trackSend } = require('../services/leadgen.service');
          await trackSend(senderEmail);
        } catch (_) {}
      }

      // Record the email
      await query(
        `INSERT INTO outreach_emails (lead_id, touch_number, subject, body, gmail_message_id, variant, delivered_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [lead.id, nextTouch, template.subject, template.body, gmailId, lead.email_variant || '1']
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
      // Resend rejects obvious bad recipients synchronously — capture those as bounces
      // so the admin's sender-health rollup stays honest. Async bounces arrive via the
      // Resend webhook (handleResendWebhook) and are tracked there.
      const msg = (err && err.message) || '';
      if (/bounce|invalid|not.*exist|undeliverable|rejected/i.test(msg)) {
        try {
          const fromAddr = env.outreachFromEmail;
          const fromMatch = fromAddr && fromAddr.match(/<([^>]+)>/);
          const senderEmail = ((fromMatch ? fromMatch[1] : fromAddr) || '').trim().toLowerCase();
          if (senderEmail) {
            const { trackBounce } = require('../services/leadgen.service');
            await trackBounce(senderEmail);
          }
        } catch (_) {}
      }
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

// Dual-layer bot detection: user-agent match + latency threshold.
// UA match catches declared scanners (Barracuda, Mimecast, Proofpoint, etc.).
// Latency catches stealth scanners (Microsoft ATP, Google link-check) that
// pre-fetch with a generic Chrome UA — those fire within seconds of send, no
// human opens an email that fast.
const SCANNER_UA_RE = /barracuda|mimecast|proofpoint|symantec|forefront|microsoft office|outlook-scan|google-safety|postfix|mailscanner|spamassassin|clamav|amavis|rspamd|messagelabs|prefetch|linkpreview|ggpht|gooletracking|safelinks/i;
const BOT_LATENCY_SECS = 60; // opens within 60s of send are classified as bots

const trackOpen = catchAsync(async (req, res) => {
  const { emailId } = req.params;
  if (emailId) {
    const ua = String(req.headers['user-agent'] || '').slice(0, 500);
    const ip = String(
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      req.ip ||
      req.connection?.remoteAddress ||
      ''
    ).slice(0, 64);
    const uaLower = ua.toLowerCase();
    const uaLooksBot = !ua || ua.length < 20 || SCANNER_UA_RE.test(uaLower);

    // Resolve the email row + compute latency from sent_at in a single query.
    // Match by gmail_message_id, outreach_emails.id, OR the lead's
    // unsubscribe_token (follow-up pixels carry only the token).
    const emailRow = (await query(
      `SELECT oe.id, oe.lead_id, oe.sent_at,
              EXTRACT(EPOCH FROM (NOW() - oe.sent_at))::int AS latency_s
       FROM outreach_emails oe
       WHERE oe.gmail_message_id = $1 OR oe.id::text = $1
          OR (oe.lead_id = (SELECT id FROM outreach_leads WHERE unsubscribe_token::text = $1 LIMIT 1)
              AND oe.human_opened_at IS NULL)
       ORDER BY oe.sent_at DESC
       LIMIT 1`,
      [emailId]
    ).catch(() => ({ rows: [] }))).rows[0];

    if (emailRow) {
      const latencyTooFast = typeof emailRow.latency_s === 'number' && emailRow.latency_s < BOT_LATENCY_SECS;
      const isBot = uaLooksBot || latencyTooFast;

      if (isBot) {
        // Record bot activity — useful for later audit — but do NOT mark human-open
        await query(
          `UPDATE outreach_emails
           SET bot_opened_at = COALESCE(bot_opened_at, NOW()),
               open_count = open_count + 1,
               first_open_ua = COALESCE(first_open_ua, $2),
               first_open_ip = COALESCE(first_open_ip, $3),
               first_open_latency_s = COALESCE(first_open_latency_s, $4)
           WHERE id = $1`,
          [emailRow.id, ua, ip, emailRow.latency_s]
        ).catch(() => {});

        await query(
          `UPDATE outreach_leads SET bot_opened_at = COALESCE(bot_opened_at, NOW()) WHERE id = $1`,
          [emailRow.lead_id]
        ).catch(() => {});
      } else {
        // Human open — populate both legacy opened_at (for back-compat) and human_opened_at
        await query(
          `UPDATE outreach_emails
           SET opened_at = COALESCE(opened_at, NOW()),
               human_opened_at = COALESCE(human_opened_at, NOW()),
               open_count = open_count + 1,
               first_open_ua = COALESCE(first_open_ua, $2),
               first_open_ip = COALESCE(first_open_ip, $3),
               first_open_latency_s = COALESCE(first_open_latency_s, $4)
           WHERE id = $1`,
          [emailRow.id, ua, ip, emailRow.latency_s]
        ).catch(() => {});

        await query(
          `UPDATE outreach_leads
           SET opened_at = COALESCE(opened_at, NOW()),
               human_opened_at = COALESCE(human_opened_at, NOW()),
               updated_at = NOW()
           WHERE id = $1`,
          [emailRow.lead_id]
        ).catch(() => {});
      }
    }
  }
  // Always serve the pixel regardless of classification
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

  // Validate URL to prevent open redirect attacks — allowlist trusted domains only
  const ALLOWED_REDIRECT_DOMAINS = new Set([
    'getmonkflow.com', 'monkflow.io', 'cal.com', 'calendly.com',
  ]);
  if (targetUrl) {
    try {
      const parsed = new URL(targetUrl);
      const host = parsed.hostname.toLowerCase();
      const isTrusted = (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
        (ALLOWED_REDIRECT_DOMAINS.has(host) || host.endsWith('.getmonkflow.com') || host.endsWith('.monkflow.io'));
      if (isTrusted) {
        res.redirect(302, targetUrl);
      } else {
        console.warn(`[OUTREACH] Blocked open redirect to untrusted domain: ${host}`);
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

  // Warming phase — derived from DOMAIN_LAUNCH_DATE
  const domainLaunchDate = new Date(process.env.DOMAIN_LAUNCH_DATE || '2026-04-10');
  const daysSinceLaunch = Math.floor((Date.now() - domainLaunchDate.getTime()) / (1000 * 60 * 60 * 24));
  let warmingPhase;
  if (daysSinceLaunch < 0) warmingPhase = { phase: 'pre-launch', daily: 0, perSender: 0, day: daysSinceLaunch };
  else if (daysSinceLaunch < 7) warmingPhase = { phase: 'warm-1', daily: 15, perSender: 5, day: daysSinceLaunch };
  else if (daysSinceLaunch < 14) warmingPhase = { phase: 'warm-2', daily: 30, perSender: 10, day: daysSinceLaunch };
  else if (daysSinceLaunch < 21) warmingPhase = { phase: 'warm-3', daily: 60, perSender: 20, day: daysSinceLaunch };
  else if (daysSinceLaunch < 28) warmingPhase = { phase: 'warm-4', daily: 75, perSender: 25, day: daysSinceLaunch };
  else warmingPhase = { phase: 'full', daily: 90, perSender: 30, day: daysSinceLaunch };

  // Funnel stats — emails_sent counts actual sends in window (matches Resend dashboard).
  // Previous version counted outreach_leads filtered by created_at, which excluded
  // older leads touched during the window — making admin totals lag Resend by 80%+.
  const { rows: [emailCount] } = await query(
    `SELECT COUNT(*)::int AS emails_sent,
            COUNT(DISTINCT lead_id)::int AS leads_touched
     FROM outreach_emails
     WHERE sent_at >= $1`,
    [since]
  );
  const { rows: [leadStats] } = await query(
    `SELECT
       COUNT(*) AS total_leads,
       COUNT(*) FILTER (WHERE human_opened_at IS NOT NULL AND human_opened_at >= $1) AS opens_recorded,
       COUNT(*) FILTER (WHERE bot_opened_at IS NOT NULL AND bot_opened_at >= $1) AS bot_opens_filtered,
       COUNT(*) FILTER (WHERE (replied_at IS NOT NULL AND replied_at >= $1) OR (status = 'replied' AND updated_at >= $1)) AS replies_received,
       COUNT(*) FILTER (WHERE status = 'replied' AND updated_at >= $1) AS positive_replies,
       COUNT(*) FILTER (WHERE status = 'unsubscribed' AND updated_at >= $1) AS unsubscribed,
       COUNT(*) FILTER (WHERE status = 'closed' AND updated_at >= $1) AS sequence_completed
     FROM outreach_leads
     WHERE created_at >= $1 OR last_sent_at >= $1 OR updated_at >= $1`,
    [since]
  );
  const funnel = {
    total_leads: leadStats.total_leads,
    emails_sent: emailCount.emails_sent,
    leads_touched: emailCount.leads_touched,
    opens_recorded: leadStats.opens_recorded,          // HUMAN opens only
    bot_opens_filtered: leadStats.bot_opens_filtered,  // transparency: how many bots we excluded
    replies_received: leadStats.replies_received,
    positive_replies: leadStats.positive_replies,
    unsubscribed: leadStats.unsubscribed,
    sequence_completed: leadStats.sequence_completed,
  };

  // Overall deliverability health (aggregate bounce/complaint across all senders, all time in window)
  const { rows: [deliverability] } = await query(
    `SELECT
       COALESCE(SUM(sent_count), 0) AS total_sent,
       COALESCE(SUM(bounce_count), 0) AS total_bounces,
       COALESCE(SUM(complaint_count), 0) AS total_complaints,
       ROUND(COALESCE(SUM(bounce_count), 0)::numeric / NULLIF(SUM(sent_count), 0) * 100, 2) AS bounce_rate,
       ROUND(COALESCE(SUM(complaint_count), 0)::numeric / NULLIF(SUM(sent_count), 0) * 100, 2) AS complaint_rate,
       ROUND((COALESCE(SUM(sent_count), 0) - COALESCE(SUM(bounce_count), 0))::numeric / NULLIF(SUM(sent_count), 0) * 100, 1) AS delivery_rate
     FROM sender_health
     WHERE date >= $1::date`,
    [since]
  );

  // Daily trend — sent + replied only (opens are unreliable due to scanner filtering transition)
  const { rows: dailyTrend } = await query(
    `SELECT
       date_trunc('day', oe.sent_at)::date AS date,
       COUNT(*) AS sent,
       COUNT(*) FILTER (WHERE oe.reply_received_at IS NOT NULL) AS replied,
       COUNT(DISTINCT oe.lead_id) AS unique_leads
     FROM outreach_emails oe
     WHERE oe.sent_at >= $1
     GROUP BY date_trunc('day', oe.sent_at)::date
     ORDER BY date`,
    [since]
  );

  // By industry breakdown
  const { rows: byIndustry } = await query(
    `SELECT
       COALESCE(industry, 'unknown') AS industry,
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE touch_count >= 1) AS sent,
       COUNT(*) FILTER (WHERE status = 'replied') AS replied,
       ROUND(COUNT(*) FILTER (WHERE status = 'replied')::numeric / NULLIF(COUNT(*) FILTER (WHERE touch_count >= 1), 0) * 100, 1) AS reply_rate
     FROM outreach_leads
     WHERE created_at >= $1
     GROUP BY industry
     ORDER BY sent DESC
     LIMIT 15`,
    [since]
  );

  // By touch number (human_opened_at for real open rate, bot_opened_at for transparency)
  const { rows: byTouch } = await query(
    `SELECT
       touch_number,
       COUNT(*) AS sent,
       COUNT(*) FILTER (WHERE human_opened_at IS NOT NULL) AS real_opens,
       COUNT(*) FILTER (WHERE bot_opened_at IS NOT NULL) AS bot_opens,
       ROUND(COUNT(*) FILTER (WHERE human_opened_at IS NOT NULL)::numeric / NULLIF(COUNT(*), 0) * 100, 1) AS real_open_rate,
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
       SUM(bounce_count) AS bounces_7d,
       ROUND(SUM(bounce_count)::numeric / NULLIF(SUM(sent_count), 0) * 100, 1) AS bounce_rate,
       ROUND(SUM(complaint_count)::numeric / NULLIF(SUM(sent_count), 0) * 100, 1) AS complaint_rate,
       ROUND((SUM(sent_count) - SUM(bounce_count))::numeric / NULLIF(SUM(sent_count), 0) * 100, 1) AS delivery_rate
     FROM sender_health
     WHERE date >= CURRENT_DATE - INTERVAL '7 days'
     GROUP BY sender_email
     ORDER BY sent_7d DESC`
  );

  // Recent emails (for the sidebar detail view)
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
    warmingPhase,
    deliverability: deliverability || {},
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
    C: 'C — Loom Bait (retired)',
    D: 'D — Teardown Offer (retired)',
    E: 'E — Sharp Question (retired)',
    F: 'F — Cost of Inaction (retired)',
    '1': '1 — Specific Observation + Question',
    '2': '2 — Free Teardown',
    '3': '3 — Peer Reference',
  };
  const { rows } = await query(`
    SELECT
      ol.email_variant AS variant,
      COUNT(*) AS sent,
      COUNT(*) FILTER (WHERE ol.human_opened_at IS NOT NULL) AS real_opens,
      COUNT(*) FILTER (WHERE ol.bot_opened_at IS NOT NULL) AS bot_opens,
      ROUND(COUNT(*) FILTER (WHERE ol.human_opened_at IS NOT NULL)::numeric / NULLIF(COUNT(*), 0) * 100, 1) AS real_open_rate,
      COUNT(*) FILTER (WHERE ol.replied_at IS NOT NULL OR ol.status = 'replied') AS replied,
      COUNT(*) FILTER (WHERE ol.reply_sentiment = 'positive') AS positive,
      COUNT(*) FILTER (WHERE ol.status = 'unsubscribed') AS unsubscribed,
      ROUND(COUNT(*) FILTER (WHERE ol.replied_at IS NOT NULL OR ol.status = 'replied')::numeric / NULLIF(COUNT(*), 0) * 100, 1) AS reply_rate,
      ROUND(COUNT(*) FILTER (WHERE ol.status = 'unsubscribed')::numeric / NULLIF(COUNT(*), 0) * 100, 1) AS unsub_rate
    FROM outreach_leads ol
    WHERE ol.touch_count >= 1
      AND ol.email_variant IN ('A', 'B', 'C', 'D', 'E', 'F', '1', '2', '3')
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

// Resend signs webhooks via Svix. Verify HMAC-SHA256 of
// `${svix-id}.${svix-timestamp}.${rawBody}` using the base64-decoded secret
// (strip the `whsec_` prefix). Timestamp is rejected if skew > 5 min to
// prevent replay. Without this, anyone can POST fake bounce/complaint
// events and close real leads.
function verifyResendSignature(req) {
  const secret = env.resendWebhookSecret;
  if (!secret) return false;

  const svixId = req.headers['svix-id'];
  const svixTimestamp = req.headers['svix-timestamp'];
  const svixSignature = req.headers['svix-signature'];
  if (!svixId || !svixTimestamp || !svixSignature) return false;

  const ts = parseInt(svixTimestamp, 10);
  if (Number.isNaN(ts)) return false;
  const skew = Math.abs(Math.floor(Date.now() / 1000) - ts);
  if (skew > 300) return false;

  const rawBody = req.rawBody
    ? (Buffer.isBuffer(req.rawBody) ? req.rawBody.toString('utf8') : String(req.rawBody))
    : JSON.stringify(req.body || {});
  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;

  const crypto = require('crypto');
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = crypto.createHmac('sha256', key).update(signedContent).digest('base64');
  const expectedBuf = Buffer.from(expected, 'base64');

  for (const pair of svixSignature.split(' ')) {
    const [, sig] = pair.split(',');
    if (!sig) continue;
    try {
      const sigBuf = Buffer.from(sig, 'base64');
      if (sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf)) {
        return true;
      }
    } catch {
      continue;
    }
  }
  return false;
}

const handleResendWebhook = catchAsync(async (req, res) => {
  if (!verifyResendSignature(req)) {
    console.warn('[OUTREACH] Resend webhook signature verification failed');
    return res.status(401).json({ error: 'Invalid webhook signature' });
  }

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
  // Apply same latency-based bot detection: Resend "opens" from within 60s
  // of send are ESP pre-fetches (very common with Gmail image proxy).
  if (type === 'email.opened') {
    const emailId = data?.email_id;
    if (emailId) {
      const emailRow = (await query(
        `SELECT id, lead_id, sent_at,
                EXTRACT(EPOCH FROM (NOW() - sent_at))::int AS latency_s
         FROM outreach_emails WHERE gmail_message_id = $1 LIMIT 1`,
        [emailId]
      ).catch(() => ({ rows: [] }))).rows[0];

      if (emailRow) {
        const latencyTooFast = typeof emailRow.latency_s === 'number' && emailRow.latency_s < 60;
        if (latencyTooFast) {
          await query(
            `UPDATE outreach_emails SET bot_opened_at = COALESCE(bot_opened_at, NOW()) WHERE id = $1`,
            [emailRow.id]
          ).catch(() => {});
          await query(
            `UPDATE outreach_leads SET bot_opened_at = COALESCE(bot_opened_at, NOW()) WHERE id = $1`,
            [emailRow.lead_id]
          ).catch(() => {});
        } else {
          await query(
            `UPDATE outreach_emails
             SET opened_at = COALESCE(opened_at, NOW()),
                 human_opened_at = COALESCE(human_opened_at, NOW())
             WHERE id = $1`,
            [emailRow.id]
          ).catch(() => {});
          await query(
            `UPDATE outreach_leads
             SET opened_at = COALESCE(opened_at, NOW()),
                 human_opened_at = COALESCE(human_opened_at, NOW()),
                 updated_at = NOW()
             WHERE id = $1`,
            [emailRow.lead_id]
          ).catch(() => {});
        }
      }
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
