const env = require('../config/env');
const { query } = require('../config/database');
const { sendEmail } = require('./email.service');
const { getFirstName, cleanCompanyName } = require('../utils/nameParser');
const dns = require('dns');
const { promisify } = require('util');
const https = require('https');
const http = require('http');
const { URL } = require('url');

const resolveMx = promisify(dns.resolveMx);

// ── Case study references (AI picks the most relevant) ────
const CASE_STUDIES = [
  {
    name: 'Team Financial Strategies',
    industry: 'wealth management / financial services',
    what: 'automated client onboarding contract system with CRM integration',
    result: 'cut new-client onboarding from 45 minutes to under 5',
    detail: 'custom contract form that auto-populates their Redtail CRM, generates signed agreements as PDFs, and syncs client financial profiles',
  },
  {
    name: 'a local healthcare practice',
    industry: 'healthcare / dental / medical',
    what: 'online scheduling + automated intake forms with patient portal',
    result: 'freed up 12 hours/week of front-desk time and reduced no-shows by 35%',
    detail: 'self-service booking, digital intake forms that pre-fill into their EHR, automated appointment reminders via SMS and email',
  },
  {
    name: 'a growing e-commerce brand',
    industry: 'retail / e-commerce / general business',
    what: 'order-to-fulfillment automation connecting their store, inventory, and shipping',
    result: 'eliminated 15 hours/week of manual order processing and cut shipping errors to near zero',
    detail: 'automated pipeline from order placement to label printing, real-time inventory sync, and exception alerts',
  },
];

// ── Website fetcher ────────────────────────────────────────
function fetchUrl(url, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === 'https:' ? https : http;
    const req = client.get(url, {
      timeout,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MonkFlow/1.0)' },
    }, (res) => {
      // Follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirect = res.headers.location.startsWith('http')
          ? res.headers.location
          : `${parsed.protocol}//${parsed.host}${res.headers.location}`;
        return fetchUrl(redirect, timeout).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function analyzeWebsite(domain) {
  let html = '';
  // Try HTTPS first, then HTTP
  for (const protocol of ['https', 'http']) {
    try {
      html = await fetchUrl(`${protocol}://${domain}`, 8000);
      if (html.length > 200) break;
    } catch { /* try next */ }
  }

  if (!html || html.length < 200) {
    return { success: false, analysis: `Could not fetch website for ${domain}` };
  }

  // Extract useful text (strip HTML tags, scripts, styles)
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 3000); // Limit to prevent huge payloads

  // Extract meta description and title
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)/i);
  const title = titleMatch ? titleMatch[1].trim() : '';
  const description = descMatch ? descMatch[1].trim() : '';

  // Look for pain point indicators
  const indicators = [];
  if (/contact us|get in touch|call us/i.test(html) && !/book online|schedule|calendar/i.test(html)) {
    indicators.push('No online booking/scheduling — relies on phone/email contact');
  }
  if (/form/i.test(html) && !/automated|instant|real-time/i.test(html)) {
    indicators.push('Has contact forms but no automation/instant response');
  }
  if (/spreadsheet|manual|paper/i.test(html)) {
    indicators.push('Mentions manual processes');
  }
  if (!/portal|dashboard|login|client area/i.test(html)) {
    indicators.push('No client portal detected');
  }

  return {
    success: true,
    analysis: JSON.stringify({
      domain,
      title,
      description,
      content_preview: text.substring(0, 1500),
      pain_indicators: indicators,
    }),
  };
}

// ── AI email generator ─────────────────────────────────────

const SYSTEM_PROMPT = `You are writing a cold email for Nathan, who runs MonkFlow — a dev agency that builds custom automation tools, client portals, and workflow software for SMBs.

GOAL: Write an email that stands out in a crowded inbox. This person gets dozens of cold emails a week. Yours needs to feel different.

STRUCTURE — randomly pick ONE of these two frameworks per email (do NOT always use the same one):

FRAMEWORK A — "Insight Lead":
- Open with a specific, useful insight or stat relevant to their industry/situation (e.g., "Practices your size that add online self-scheduling typically see 30-40% fewer no-shows"). Use the website analysis to make it relevant.
- Then briefly connect it to what you can do — one sentence, tied to a case study result.
- Close with a low-friction question CTA.

FRAMEWORK B — "Question Lead":
- Open with a specific question about their operations that they can't read without mentally answering (e.g., "Curious — how much of your team's week goes to manually processing [X]?"). Base the question on pain points from their website analysis.
- Then share a concrete result — one sentence from a case study.
- Close with a low-friction question CTA.

CASE STUDIES (pick the one closest to this prospect's industry):
${CASE_STUDIES.map((cs, i) => `${i + 1}. ${cs.name} (${cs.industry}): ${cs.what}. Result: ${cs.result}.`).join('\n')}
If none match well, use the result numbers without naming the client.

HARD RULES:
- Under 100 words. 3-4 short paragraphs max. Every word must earn its place.
- NEVER start the email with "I" — the first word should be about them, a question, or an insight.
- NEVER use "I was checking out your site", "I came across your website", "I noticed", or any variation. These are the most common cold email openers in existence — they signal mass outreach instantly.
- NEVER use the phrases "reaching out", "touching base", "hope this finds you well", or "I'd love to".
- Subject line: 2-5 words, lowercase, no punctuation. Must feel like a text from a colleague, not a marketing email. Examples of good patterns: "{company} + automation", "your booking page", "saving 10 hrs/week", "{firstName}, quick question". NEVER use the word "thought" or "idea" in the subject.
- CTA: one soft question, and include a booking link naturally. Example: "Worth a quick chat? Here's my calendar: {bookingUrl}" — but make it feel casual, not salesy. NEVER mention a specific time commitment like "15-minute call" or "30-minute demo".
- Sign off as just "Nathan" — no last name, no company name, no URL, no title.
- The case study mention should be ONE sentence woven into the email, never a separate paragraph.

OUTPUT FORMAT: Return valid JSON only, no markdown:
{"subject": "...", "body": "..."}

The body should be plain text with \\n for line breaks (will be converted to HTML for sending).`;

async function generateEmailForLead(lead, websiteAnalysis, variant) {
  if (!env.anthropicApiKey) {
    throw new Error('AI email generation unavailable: Anthropic API key not configured. Set ANTHROPIC_API_KEY in environment variables.');
  }

  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: env.anthropicApiKey });

  const firstName = getFirstName(lead.contact_name, lead.contact_email);
  const company = cleanCompanyName(lead.company || 'Unknown');
  let userPrompt = `Write a personalized cold email for this prospect:

Name: ${firstName}
Email: ${lead.contact_email}
Company: ${company}
Website Analysis: ${websiteAnalysis}
Booking URL: ${env.bookingUrl}

Address them as "${firstName}". Use the booking URL naturally in the CTA.`;

  // A/B variant override: instruct the AI to use a specific framework
  if (variant === 'A') {
    userPrompt += '\n\nIMPORTANT: You MUST use FRAMEWORK A ("Insight Lead") for this email. Do NOT use Framework B.';
  } else if (variant === 'B') {
    userPrompt += '\n\nIMPORTANT: You MUST use FRAMEWORK B ("Question Lead") for this email. Do NOT use Framework A.';
  }

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    temperature: 0.7,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const text = response.content[0]?.text || '';
  // If no variant specified, the AI picks randomly — label as unknown to avoid polluting A/B data
  const usedVariant = variant || 'unknown';

  // Parse JSON from response
  try {
    // Try direct parse first
    const parsed = JSON.parse(text);
    if (!parsed.subject || !parsed.body) throw new Error('Missing subject or body');
    return { subject: parsed.subject, body: parsed.body, variant: usedVariant };
  } catch {
    // Try extracting JSON from markdown code block
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.subject && parsed.body) {
          return { subject: parsed.subject, body: parsed.body, variant: usedVariant };
        }
      } catch { /* fall through */ }
    }
    throw new Error('Failed to parse AI response as JSON');
  }
}

// ── Main orchestrators ─────────────────────────────────────

async function generateForLead(leadId) {
  const { rows } = await query('SELECT * FROM outreach_leads WHERE id = $1', [leadId]);
  if (!rows[0]) throw new Error('Lead not found');
  const lead = rows[0];

  // Derive domain from email
  const domain = lead.contact_email.split('@')[1];

  // Analyze website (use cached if available)
  let analysis = lead.website_analysis;
  if (!analysis) {
    const result = await analyzeWebsite(domain);
    analysis = result.analysis;
  }

  // Generate email
  const email = await generateEmailForLead(lead, analysis);

  // Convert body line breaks to HTML
  const htmlBody = `<div style="font-family:sans-serif;max-width:600px;">${email.body.split('\n').map(line =>
    line.trim() ? `<p style="margin:0 0 12px;">${line}</p>` : ''
  ).join('')}</div>`;

  // Store results
  await query(
    `UPDATE outreach_leads
     SET website_analysis = $1, ai_email_subject = $2, ai_email_body = $3,
         ai_email_generated_at = NOW(), updated_at = NOW()
     WHERE id = $4`,
    [analysis, email.subject, htmlBody, leadId]
  );

  return { lead_id: leadId, subject: email.subject, body: htmlBody };
}

async function generateForAllPriority() {
  const { rows: leads } = await query(
    `SELECT id FROM outreach_leads
     WHERE priority = true AND status = 'active' AND ai_email_sent_at IS NULL
     ORDER BY created_at ASC`
  );

  let generated = 0;
  let errors = 0;

  for (const lead of leads) {
    try {
      await generateForLead(lead.id);
      generated++;
      // Rate limit: 2 second delay between API calls
      if (leads.indexOf(lead) < leads.length - 1) {
        await new Promise(r => setTimeout(r, 2000));
      }
    } catch (err) {
      console.error(`[OUTREACH-AI] Failed for lead ${lead.id}:`, err.message);
      errors++;
    }
  }

  return { generated, errors, total: leads.length };
}

async function sendAiEmail(leadId) {
  const { rows } = await query('SELECT * FROM outreach_leads WHERE id = $1', [leadId]);
  if (!rows[0]) throw new Error('Lead not found');
  const lead = rows[0];

  if (!lead.ai_email_body) throw new Error('No AI email generated yet — generate first');
  if (lead.ai_email_sent_at) throw new Error('AI email already sent');

  // Build anti-spam headers
  const replyTo = process.env.LEADGEN_REPLY_TO || 'nathan@mail.getmonkflow.com';
  const emailHeaders = { 'Reply-To': replyTo };

  // List-Unsubscribe (Gmail/Yahoo requirement for bulk senders)
  const unsubToken = lead.unsubscribe_token;
  if (unsubToken) {
    const unsubUrl = `https://getmonkflow.com/api/v1/leadgen/unsubscribe/${unsubToken}`;
    emailHeaders['List-Unsubscribe'] = `<${unsubUrl}>`;
    emailHeaders['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
  }

  // Append tracking pixel and unsub footer if not already in the body
  let htmlBody = lead.ai_email_body;
  if (unsubToken && !htmlBody.includes('track/open/')) {
    const unsubUrl = `https://getmonkflow.com/api/v1/leadgen/unsubscribe/${unsubToken}`;
    const unsubFooter = `<div style="margin-top:20px;font-size:11px;color:#999;"><p><a href="${unsubUrl}" style="color:#999;">Unsubscribe</a></p></div>`;
    const trackingPixel = `<img src="https://getmonkflow.com/api/v1/outreach/track/open/${unsubToken}" width="1" height="1" style="display:none" alt="" />`;
    htmlBody = `${htmlBody}${unsubFooter}${trackingPixel}`;
  }

  // Plain-text alternative (improves deliverability score)
  const plainText = htmlBody
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const emailResult = await sendEmail({
    from: env.outreachFromEmail || 'Nathan Linder <nathan@getmonkflow.com>',
    to: lead.contact_email,
    subject: lead.ai_email_subject,
    html: htmlBody,
    text: plainText,
    headers: emailHeaders,
  });

  const gmailId = emailResult?.data?.id || emailResult?.id || null;

  // Record in outreach_emails as touch 0 (AI pre-sequence email)
  await query(
    `INSERT INTO outreach_emails (lead_id, touch_number, subject, body, gmail_message_id)
     VALUES ($1, 0, $2, $3, $4)`,
    [leadId, lead.ai_email_subject, lead.ai_email_body, gmailId]
  );

  // Store original message ID and subject for follow-up threading
  await query(
    `UPDATE outreach_leads
     SET ai_email_sent_at = NOW(), original_message_id = $2, original_subject = $3, updated_at = NOW()
     WHERE id = $1`,
    [leadId, gmailId, lead.ai_email_subject]
  );

  return { sent: true, to: lead.contact_email };
}

// ── AI follow-up generator (for touches 2-4) ─────────────────

const FOLLOWUP_SYSTEM_PROMPT = `You are writing a follow-up email for Nathan, who runs MonkFlow — a dev agency that builds custom automation tools, client portals, and workflow software for SMBs.

This is a FOLLOW-UP email in an existing thread. The prospect received a first email and hasn't replied yet.

CASE STUDIES (pick the one closest to this prospect's industry):
${CASE_STUDIES.map((cs, i) => `${i + 1}. ${cs.name} (${cs.industry}): ${cs.what}. Result: ${cs.result}. Detail: ${cs.detail}.`).join('\n')}

HARD RULES:
- Under 60 words. 2-3 short paragraphs max.
- NEVER start with "I" — start with value or a question.
- NEVER use "following up", "circling back", "checking in", "bumping this", "just wanted to".
- Be conversational, not salesy. Sound like a real person continuing a conversation.
- Include the booking link naturally in the CTA when provided. Example: "Here's my calendar if easier: {bookingUrl}" — keep it casual.
- No sign-off block — just "Nathan".
- Output valid JSON only: {"subject": "...", "body": "..."}
- Body is plain text with \\n for line breaks.`;

async function generateFollowup(lead, touchNumber) {
  if (!env.anthropicApiKey) {
    throw new Error('AI follow-up unavailable: Anthropic API key not configured.');
  }

  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: env.anthropicApiKey });

  const firstName = getFirstName(lead.contact_name, lead.contact_email);
  const company = cleanCompanyName(lead.company || '');
  const industry = lead.industry || 'small business';
  const origSubject = lead.original_subject || lead.ai_email_subject || 'your business';

  // Build context about the lead's website issues
  let diagnosisContext = '';
  if (lead.diagnosis_scores) {
    const d = typeof lead.diagnosis_scores === 'string' ? JSON.parse(lead.diagnosis_scores) : lead.diagnosis_scores;
    const gaps = [];
    if (!d.has_ssl) gaps.push('no SSL');
    if (!d.has_booking_software) gaps.push('no online booking');
    if (!d.has_client_portal) gaps.push('no client portal');
    if (!d.has_intake_forms) gaps.push('no digital intake forms');
    if (d.design_age_estimate === 'outdated') gaps.push('outdated website design');
    if (gaps.length) diagnosisContext = `Website gaps identified: ${gaps.join(', ')}.`;
  }

  let touchInstruction;
  switch (touchNumber) {
    case 2:
      touchInstruction = `TOUCH 2 — Value proof. Share a specific, concrete result from the most relevant case study. Make it feel like you're sharing something useful, not selling. End with a soft question.
Subject: Use "Re: ${origSubject}" for email threading.`;
      break;
    case 3:
      touchInstruction = `TOUCH 3 — Free value offer. Offer a specific, useful insight about THEIR business based on their website gaps. Position it as genuinely helpful with no strings attached.
Subject: Create a NEW short subject line (2-4 words) — something like "${company || firstName} + automation" or a reference to their specific gap.`;
      break;
    case 4:
      touchInstruction = `TOUCH 4 — Graceful breakup. Acknowledge the timing may not be right. Leave the door open. Be genuinely warm and wish them well.
Subject: Use "Re: ${origSubject}" for email threading.`;
      break;
    default:
      throw new Error(`Invalid touch number: ${touchNumber}`);
  }

  const userPrompt = `Write follow-up email #${touchNumber} for this prospect:

Name: ${firstName}
Company: ${company}
Industry: ${industry}
Booking URL: ${env.bookingUrl}
${diagnosisContext}

Original email subject: "${origSubject}"
${lead.original_email_body ? `Original email body summary: The first email mentioned their specific automation opportunities based on their website analysis.` : ''}

${touchInstruction}

Include the booking URL naturally in the CTA.`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 512,
    temperature: 0.7,
    system: FOLLOWUP_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const text = response.content[0]?.text || '';

  try {
    const parsed = JSON.parse(text);
    if (!parsed.subject || !parsed.body) throw new Error('Missing subject or body');
    return { subject: parsed.subject, body: parsed.body };
  } catch {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.subject && parsed.body) {
          return { subject: parsed.subject, body: parsed.body };
        }
      } catch { /* fall through */ }
    }
    throw new Error('Failed to parse AI follow-up response as JSON');
  }
}

// ── Email verification ─────────────────────────────────────

const net = require('net');

const BAD_PATTERNS = [
  /^test@/i, /^admin@example/i, /^user@/i, /^noreply@/i, /^no-reply@/i,
  /^filler@/i, /^johndoe@/i, /^jsmith@/i, /^demo@/i,
  /^postmaster@/i, /^mailer-daemon@/i, /^webmaster@/i,
  /^abuse@/i, /^spam@/i, /^root@/i, /^hostmaster@/i,
  /^myself@/i, /^me@/i, /^owner@/i,
  /@example\.(com|org|net)$/i, /@test\./i, /@invalid$/i,
  /^.{60,}@/,  // Extremely long local parts (garbled data)
  /^.{1,2}@/,  // Too-short local parts (a@, ab@)
  /[+=%].*@/,  // Encoded characters in local part
  /^u0022/i,   // Unicode-encoded quote prefix (malformed scrape data)
  /^insurers@/i, // Generic role addresses that bounce
  /^[A-Z][a-z]+[A-Z][a-z]+[A-Z]/,  // CamelCase garbage like "WheelerDwheeler"
  /\.\./,      // Double dots anywhere
  // ── Role-based addresses (high bounce risk, not real people) ──
  /^info@/i, /^support@/i, /^contact@/i, /^admin@/i, /^office@/i,
  /^sales@/i, /^help@/i, /^billing@/i, /^legal@/i, /^hr@/i,
  /^marketing@/i, /^hello@/i, /^general@/i, /^team@/i,
  /^directory@/i, /^reception@/i, /^inquiries@/i, /^enquiries@/i,
  /^careers@/i, /^jobs@/i, /^media@/i, /^press@/i, /^service@/i,
  /^feedback@/i, /^accounts@/i, /^mail@/i, /^staff@/i,
];

// TLDs that are almost always garbage from bad scraping
const SUSPICIOUS_TLDS = new Set([
  'dr', 'co', 'xyz', 'top', 'tk', 'ml', 'ga', 'cf', 'gq', 'buzz',
  'club', 'work', 'click', 'link', 'monster', 'rest', 'icu', 'fun',
]);

const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'tempmail.com', 'throwaway.email',
  'yopmail.com', '10minutemail.com', 'trashmail.com',
]);

// Common typo domains that cause permanent bounces
const TYPO_DOMAINS = new Map([
  ['gmial.com', 'gmail.com'], ['gmal.com', 'gmail.com'], ['gmaill.com', 'gmail.com'],
  ['gamil.com', 'gmail.com'], ['gnail.com', 'gmail.com'],
  ['outlok.com', 'outlook.com'], ['outloo.com', 'outlook.com'],
  ['hotmial.com', 'hotmail.com'], ['hotmal.com', 'hotmail.com'],
  ['yahooo.com', 'yahoo.com'], ['yaho.com', 'yahoo.com'],
]);

// SMTP RCPT TO verification — checks if the mailbox actually exists
function smtpVerify(email, mxHost, timeout = 10000) {
  return new Promise((resolve) => {
    const socket = net.createConnection(25, mxHost);
    let step = 0;
    let response = '';
    let resolved = false;

    const done = (valid, reason) => {
      if (resolved) return;
      resolved = true;
      try { socket.end('QUIT\r\n'); } catch {}
      try { socket.destroy(); } catch {}
      resolve({ valid, reason });
    };

    const timer = setTimeout(() => done(true, 'SMTP timeout — assuming valid'), timeout);

    socket.setEncoding('utf-8');
    socket.on('data', (data) => {
      response += data;
      const code = parseInt(response.substring(0, 3));

      if (step === 0 && code >= 200 && code < 300) {
        // Connected, send HELO
        step = 1;
        response = '';
        socket.write('HELO getmonkflow.com\r\n');
      } else if (step === 1 && code === 250) {
        // HELO accepted, send MAIL FROM
        step = 2;
        response = '';
        socket.write('MAIL FROM:<verify@getmonkflow.com>\r\n');
      } else if (step === 2 && code === 250) {
        // MAIL FROM accepted, send RCPT TO
        step = 3;
        response = '';
        socket.write(`RCPT TO:<${email}>\r\n`);
      } else if (step === 3) {
        clearTimeout(timer);
        if (code === 250 || code === 251) {
          done(true, 'SMTP verified — mailbox exists');
        } else if (code === 550 || code === 551 || code === 552 || code === 553) {
          done(false, 'SMTP rejected — mailbox does not exist');
        } else if (code === 450 || code === 451 || code === 452) {
          // Temporary error — be optimistic (greylisting etc.)
          done(true, 'SMTP temporary error — assuming valid');
        } else {
          done(true, `SMTP code ${code} — assuming valid`);
        }
      } else if (step < 3 && code >= 400) {
        clearTimeout(timer);
        // Server rejected early — can't verify, assume valid
        done(true, `SMTP early rejection (code ${code}) — assuming valid`);
      }
    });

    socket.on('error', () => {
      clearTimeout(timer);
      done(true, 'SMTP connection failed — assuming valid');
    });

    socket.on('timeout', () => {
      clearTimeout(timer);
      done(true, 'SMTP socket timeout — assuming valid');
    });

    socket.setTimeout(timeout);
  });
}

async function verifyEmail(email) {
  if (!email || typeof email !== 'string') {
    return { valid: false, reason: 'Empty or invalid email' };
  }

  // Basic format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { valid: false, reason: 'Invalid email format' };
  }

  // Check bad patterns
  for (const pattern of BAD_PATTERNS) {
    if (pattern.test(email)) {
      return { valid: false, reason: 'Known bad/test email pattern' };
    }
  }

  // Check disposable domains
  const domain = email.split('@')[1].toLowerCase();
  if (DISPOSABLE_DOMAINS.has(domain)) {
    return { valid: false, reason: 'Disposable email domain' };
  }

  // Check suspicious TLDs (common scraping garbage)
  const tld = domain.split('.').pop();
  if (SUSPICIOUS_TLDS.has(tld)) {
    return { valid: false, reason: `Suspicious TLD .${tld} — likely scraped garbage` };
  }

  // Check typo domains (gmial.com, outlok.com, etc.)
  if (TYPO_DOMAINS.has(domain)) {
    return { valid: false, reason: `Typo domain ${domain} (likely meant ${TYPO_DOMAINS.get(domain)})` };
  }

  // Normalize to lowercase AFTER BAD_PATTERNS check (which catches CamelCase garbage)
  // RFC 5321: local part is case-insensitive in practice for all major providers
  email = email.toLowerCase();

  // Check if domain has previous bounces (domain-level suppression)
  try {
    const { query: dbq } = require('../config/database');
    const { rows } = await dbq(
      `SELECT 1 FROM leads WHERE email LIKE $1 AND status = 'bounced' LIMIT 1`,
      [`%@${domain}`]
    );
    if (rows.length > 0) {
      return { valid: false, reason: `Domain ${domain} has previous bounces — suppressed` };
    }
  } catch (_) { /* don't block on DB errors */ }

  // MX record check
  let mxRecords;
  try {
    mxRecords = await Promise.race([
      resolveMx(domain),
      new Promise((_, reject) => setTimeout(() => reject(new Error('MX timeout')), 5000)),
    ]);
    if (!mxRecords || mxRecords.length === 0) {
      return { valid: false, reason: 'No MX records — domain cannot receive email' };
    }
  } catch (err) {
    if (err.message === 'MX timeout') {
      return { valid: true, reason: 'MX lookup timed out — assuming valid' };
    }
    if (err.code === 'ENOTFOUND' || err.code === 'ENODATA') {
      return { valid: false, reason: 'Domain does not exist' };
    }
    return { valid: true, reason: `DNS check inconclusive: ${err.message}` };
  }

  // MX records exist — email domain is valid
  // Note: mailbox-level verification (SMTP RCPT TO) is not reliable from
  // cloud environments (port 25 blocked). Bounce protection is handled
  // reactively via the Resend webhook at /api/v1/outreach/webhook/resend
  return { valid: true, reason: 'OK', normalizedEmail: email };
}

module.exports = {
  analyzeWebsite,
  generateForLead,
  generateForAllPriority,
  sendAiEmail,
  verifyEmail,
  generateEmailForLead,
  generateFollowup,
  CASE_STUDIES,
};
