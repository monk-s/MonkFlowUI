const { query } = require('../config/database');
const env = require('../config/env');
const { sendEmail } = require('./email.service');

// HTML escape for safe injection into email notifications
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Quoted-text stripping ─────────────────────────────────
// Remove "On <date> <person> wrote:" blocks and everything after
function stripQuotedText(body) {
  if (!body) return '';

  // Common reply header patterns
  const patterns = [
    /\r?\nOn .+wrote:\s*\n[\s\S]*/i,
    /\r?\n-{2,}\s*Original Message\s*-{2,}[\s\S]*/i,
    /\r?\n>{1,}\s*.*/g,                       // > quoted lines
    /\r?\nFrom:\s.+[\s\S]*/i,                 // Outlook-style "From:" block
    /\r?\nSent from my (iPhone|iPad|Galaxy|Android).*/i,
  ];

  let cleaned = body;
  for (const p of patterns) {
    cleaned = cleaned.replace(p, '');
  }
  return cleaned.trim();
}

// ── Classify reply via Claude ─────────────────────────────

async function classifyReply(replyText) {
  if (!replyText || !replyText.trim()) {
    return { sentiment: 'neutral', summary: 'Empty reply — possibly only quoted text' };
  }

  if (!env.anthropicApiKey) {
    console.warn('[ReplyDetector] No ANTHROPIC_API_KEY — falling back to rule-based classification');
    return fallbackClassify(replyText);
  }

  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: env.anthropicApiKey });

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 256,
    temperature: 0,
    system: `You classify cold outreach email replies. Respond with ONLY valid JSON, no markdown.

Return: { "sentiment": "<value>", "summary": "<one sentence>" }

sentiment must be one of:
- "positive" — interested, wants a meeting, asks for more info, open to chatting
- "negative" — not interested, asks to be removed, unsubscribe, hostile
- "neutral" — unclear intent, asks a question without clear interest, generic acknowledgment
- "ooo" — out of office, auto-reply, vacation responder, on leave`,
    messages: [
      { role: 'user', content: `Classify this email reply:\n\n${replyText.slice(0, 2000)}` },
    ],
  });

  try {
    const text = response.content[0].text.trim();
    const parsed = JSON.parse(text);
    if (!['positive', 'negative', 'neutral', 'ooo'].includes(parsed.sentiment)) {
      parsed.sentiment = 'neutral';
    }
    return { sentiment: parsed.sentiment, summary: parsed.summary || '' };
  } catch (err) {
    console.error('[ReplyDetector] Failed to parse Claude response, falling back:', err.message);
    return fallbackClassify(replyText);
  }
}

// Rule-based fallback when Claude is unavailable
function fallbackClassify(text) {
  const lower = (text || '').toLowerCase();

  const oooPatterns = [
    /out of (the )?office/i, /auto[- ]?reply/i, /automatic reply/i,
    /on (annual |paid )?leave/i, /on vacation/i, /on holiday/i,
    /currently (out|away|unavailable)/i, /will (be back|return)/i,
  ];
  if (oooPatterns.some(p => p.test(lower))) {
    return { sentiment: 'ooo', summary: 'Out-of-office or auto-reply detected' };
  }

  const negativePatterns = [
    /not interested/i, /remove me/i, /unsubscribe/i, /stop (emailing|contacting)/i,
    /do not contact/i, /take me off/i, /no thanks/i, /please don't/i,
  ];
  if (negativePatterns.some(p => p.test(lower))) {
    return { sentiment: 'negative', summary: 'Not interested or asked to be removed' };
  }

  const positivePatterns = [
    /let'?s (chat|talk|meet|connect|schedule)/i, /interested/i, /sounds great/i,
    /tell me more/i, /set up a (call|meeting|time)/i, /free (this|next) week/i,
    /love to (learn|hear|chat|talk)/i, /book a time/i,
  ];
  if (positivePatterns.some(p => p.test(lower))) {
    return { sentiment: 'positive', summary: 'Expressed interest or wants to connect' };
  }

  return { sentiment: 'neutral', summary: 'Reply received — needs human review' };
}

// ── Add business days helper ──────────────────────────────

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

// ── Process an inbound reply ──────────────────────────────

async function processInboundReply({ from, to, subject, body, inReplyTo }) {
  const senderEmail = extractEmail(from);
  if (!senderEmail) {
    return { matched: false, reason: 'Could not extract sender email' };
  }

  const cleanBody = stripQuotedText(body);

  // Try to match lead: by In-Reply-To header → gmail_message_id, or by sender email
  let lead = null;
  let matchedEmail = null;

  if (inReplyTo) {
    const messageRef = inReplyTo.replace(/[<>]/g, '');
    const { rows } = await query(
      `SELECT oe.*, ol.id AS lead_id, ol.contact_email, ol.status AS lead_status
       FROM outreach_emails oe
       JOIN outreach_leads ol ON ol.id = oe.lead_id
       WHERE oe.gmail_message_id = $1
       LIMIT 1`,
      [messageRef]
    );
    if (rows.length > 0) {
      matchedEmail = rows[0];
      const { rows: leads } = await query('SELECT * FROM outreach_leads WHERE id = $1', [rows[0].lead_id]);
      lead = leads[0] || null;
    }
  }

  if (!lead) {
    const { rows } = await query(
      `SELECT * FROM outreach_leads WHERE LOWER(contact_email) = LOWER($1) AND status = 'active' ORDER BY last_sent_at DESC LIMIT 1`,
      [senderEmail]
    );
    lead = rows[0] || null;

    if (lead && !matchedEmail) {
      const { rows: emails } = await query(
        'SELECT * FROM outreach_emails WHERE lead_id = $1 ORDER BY touch_number DESC LIMIT 1',
        [lead.id]
      );
      matchedEmail = emails[0] || null;
    }
  }

  if (!lead) {
    return { matched: false, reason: `No matching lead found for ${senderEmail}` };
  }

  // Classify the reply
  const { sentiment, summary } = await classifyReply(cleanBody);

  // Determine new status and next_followup_at based on sentiment
  let newStatus, nextFollowupAt = null, replyIsOoo = false;

  switch (sentiment) {
    case 'positive':
      newStatus = 'replied';
      break;
    case 'negative':
      newStatus = 'closed';
      break;
    case 'ooo':
      newStatus = lead.status; // keep current status
      replyIsOoo = true;
      nextFollowupAt = addBusinessDays(new Date(), 7); // resume in 7 business days
      break;
    case 'neutral':
    default:
      newStatus = 'replied';
      break;
  }

  // Update outreach_leads
  await query(
    `UPDATE outreach_leads
     SET replied_at = COALESCE(replied_at, NOW()),
         reply_sentiment = $2,
         reply_summary = $3,
         status = $4,
         next_followup_at = $5,
         reply_is_ooo = COALESCE($6, reply_is_ooo),
         updated_at = NOW()
     WHERE id = $1`,
    [lead.id, sentiment, summary, newStatus, nextFollowupAt, replyIsOoo || null]
  );

  // Update matching outreach_emails row
  if (matchedEmail) {
    await query(
      `UPDATE outreach_emails
       SET reply_body = $2, reply_received_at = NOW()
       WHERE id = $1`,
      [matchedEmail.id, cleanBody]
    );
  }

  // If positive: send admin notification + create DB notification
  if (sentiment === 'positive' && env.ownerUserId) {
    const leadName = lead.contact_name || senderEmail;
    const company = lead.company ? ` (${lead.company})` : '';

    // DB notification (use 'system' type to match CHECK constraint)
    await query(
      `INSERT INTO notifications (user_id, type, title, message, icon, link_page)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        env.ownerUserId,
        'system',
        'Positive Reply Received',
        `${leadName}${company} replied positively: ${summary}`,
        'mail-check',
        'outreach',
      ]
    ).catch(err => console.error('[ReplyDetector] Failed to create notification:', err.message));

    // Email notification (all values HTML-escaped to prevent XSS)
    await sendEmail({
      to: process.env.OWNER_NOTIFICATION_EMAIL || env.outreachFromEmail,
      subject: `Positive reply from ${leadName}${company}`,
      html: `<div style="font-family:sans-serif;max-width:600px;">
        <h2 style="color:#00cc6a;">Positive Reply Detected</h2>
        <p><strong>From:</strong> ${escapeHtml(leadName)} &lt;${escapeHtml(senderEmail)}&gt;${escapeHtml(company)}</p>
        <p><strong>Classification:</strong> ${escapeHtml(sentiment)} — ${escapeHtml(summary)}</p>
        <div style="background:#f5f5f5;padding:16px;border-radius:8px;margin:16px 0;">
          <p style="white-space:pre-wrap;">${escapeHtml(cleanBody.slice(0, 1000))}</p>
        </div>
        <p><a href="${env.frontendUrl}/outreach" style="background:#00cc6a;color:#000;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;">View in Dashboard</a></p>
      </div>`,
    }).catch(err => console.error('[ReplyDetector] Failed to send admin email:', err.message));
  }

  console.log(`[ReplyDetector] Classified reply from ${senderEmail}: ${sentiment} — ${summary}`);

  return {
    matched: true,
    leadId: lead.id,
    leadName: lead.contact_name,
    company: lead.company,
    sentiment,
    summary,
    newStatus,
  };
}

// ── Helpers ───────────────────────────────────────────────

function extractEmail(str) {
  if (!str) return null;
  // Handle "Name <email@example.com>" format
  const match = str.match(/<([^>]+)>/);
  if (match) return match[1].toLowerCase();
  // Handle plain email
  if (str.includes('@')) return str.trim().toLowerCase();
  return null;
}

module.exports = {
  classifyReply,
  processInboundReply,
  stripQuotedText,
};
