const catchAsync = require('../utils/catchAsync');
const { query } = require('../config/database');
const ApiError = require('../utils/ApiError');
const env = require('../config/env');
const { sendEmail } = require('../services/email.service');
const outreachAI = require('../services/outreach-ai.service');

// ── Follow-up templates ────────────────────────────────────
// Touch 1 = original cold email (sent manually / externally)
// Touch 2 = Day 3 bump
// Touch 3 = Day 7 value-add
// Touch 4 = Day 14 breakup

function getFollowupTemplate(touchNumber, lead) {
  const firstName = (lead.contact_name || '').split(' ')[0] || 'there';
  const company = lead.company ? ` at ${lead.company}` : '';

  switch (touchNumber) {
    case 2:
      return {
        subject: `Re: Quick question`,
        body: `<div style="font-family:sans-serif;max-width:600px;">
          <p>Hey ${firstName},</p>
          <p>Just floating this back up in case it got buried. Would love to chat if you're open to it.</p>
          <p>Let me know either way — happy to answer any questions.</p>
          <p>Best,<br/>Nathan</p>
        </div>`,
      };
    case 3:
      return {
        subject: `Re: Quick question`,
        body: `<div style="font-family:sans-serif;max-width:600px;">
          <p>Hi ${firstName},</p>
          <p>Wanted to share a quick thought — I've been looking at how businesses${company} handle their workflows, and there's usually a lot of room to automate the repetitive stuff.</p>
          <p>If you're curious, I'd be happy to walk through a couple ideas. No pressure at all.</p>
          <p>Cheers,<br/>Nathan</p>
        </div>`,
      };
    case 4:
      return {
        subject: `Re: Quick question`,
        body: `<div style="font-family:sans-serif;max-width:600px;">
          <p>Hey ${firstName},</p>
          <p>Totally understand if the timing's off — just didn't want to drop the ball on my end.</p>
          <p>If things change down the road, my door's always open. Wishing you and the team${company} all the best.</p>
          <p>Take care,<br/>Nathan</p>
        </div>`,
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
    `SELECT * FROM outreach_leads
     WHERE status = 'active'
       AND next_followup_at <= NOW()
       AND touch_count < 4
     ORDER BY next_followup_at ASC`
  );

  const results = { sent: 0, skipped: 0, completed: 0, errors: [] };

  for (const lead of dueLeads) {
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
      const emailResult = await sendEmail({
        from: env.outreachFromEmail,
        to: lead.contact_email,
        subject: template.subject,
        html: template.body,
        headers: { 'Reply-To': process.env.LEADGEN_REPLY_TO || 'nate@thelinders.com' },
      });

      const gmailId = emailResult?.data?.id || emailResult?.id || null;

      // Record the email
      await query(
        `INSERT INTO outreach_emails (lead_id, touch_number, subject, body, gmail_message_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [lead.id, nextTouch, template.subject, template.body, gmailId]
      );

      // Update lead
      const nextFollowup = getNextFollowupDate(nextTouch, new Date());
      await query(
        `UPDATE outreach_leads
         SET touch_count = $1, last_sent_at = NOW(), next_followup_at = $2, updated_at = NOW()
         WHERE id = $3`,
        [nextTouch, nextFollowup, lead.id]
      );

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

const handleResendWebhook = catchAsync(async (req, res) => {
  const { type, data } = req.body;

  // Resend webhook events: email.bounced, email.complained, email.delivered
  if (type === 'email.bounced' || type === 'email.complained') {
    const toEmail = data?.to?.[0] || data?.email_id;

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
};
