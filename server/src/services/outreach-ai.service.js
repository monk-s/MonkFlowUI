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
    name: 'Team Financial Strategies (4-advisor wealth management firm, Dallas)',
    industry: 'wealth management / financial services',
    what: 'automated client onboarding + Redtail CRM sync',
    result: 'cut new-client setup from 45 minutes to under 5',
    detail: 'custom contract form that auto-populates Redtail CRM, generates signed agreements as PDFs, and syncs client financial profiles. Built in 2 weeks.',
  },
  {
    name: 'a 4-provider dental practice in Tulsa (6 front-desk staff)',
    industry: 'dental / healthcare / medical',
    what: 'online scheduling + digital intake forms + patient portal',
    result: 'went from 18 hrs/week on scheduling to under 2',
    detail: 'self-service booking, digital intake forms that pre-fill into their EHR, automated SMS/email reminders. Built in 3 weeks.',
  },
  {
    name: 'a 3-provider chiropractic office in Columbus',
    industry: 'chiropractic / healthcare / medical',
    what: 'digital intake + automated scheduling',
    result: 'saved 11 hrs/week of front-desk time',
    detail: 'fully digital new-patient intake flow, automated appointment scheduling, and reminder sequences. Built in 9 business days.',
  },
  {
    name: 'a Shopify e-commerce brand in Austin',
    industry: 'retail / e-commerce / general business',
    what: 'order-to-fulfillment automation connecting store, inventory, and shipping',
    result: 'eliminated 15 hrs/week of manual order processing, shipping errors near zero',
    detail: 'automated pipeline from order placement to label printing, real-time inventory sync, and exception alerts.',
  },
];

// ── Website fetcher ────────────────────────────────────────
function fetchUrl(url, timeout = 8000, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) return reject(new Error('Too many redirects'));
    const parsed = new URL(url);
    const client = parsed.protocol === 'https:' ? https : http;
    const req = client.get(url, {
      timeout,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MonkFlow/1.0)' },
    }, (res) => {
      // Follow redirects (with limit)
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirect = res.headers.location.startsWith('http')
          ? res.headers.location
          : `${parsed.protocol}//${parsed.host}${res.headers.location}`;
        return fetchUrl(redirect, timeout, maxRedirects - 1).then(resolve).catch(reject);
      }
      let data = '';
      const MAX_SIZE = 5 * 1024 * 1024; // 5MB limit
      res.on('data', chunk => {
        data += chunk;
        if (data.length > MAX_SIZE) { req.destroy(); reject(new Error('Response too large')); }
      });
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

const SYSTEM_PROMPT = `You are writing a cold email for Nathan, who runs MonkFlow — a dev agency that builds custom automation, client portals, and workflow tools for small businesses.

GOAL: Write an email that stands out in a crowded inbox. This person gets dozens of cold emails a week. Yours needs to feel different from every "I noticed your website..." template.

STRUCTURE — use the framework specified in the user prompt (1, 2, or 3). Each has a distinct approach. Follow it exactly.

FRAMEWORK 1 — "Specific Observation + Question":
- Open with ONE hyper-specific observation about their BUSINESS OPERATIONS (not their website). Use the website analysis to INFER the operational pain, don't describe the website symptom.
  - BAD: "Saw your booking routes through a contact form"
  - GOOD: "If your team is still handling new-client intake by phone, your front desk is probably spending 8-10 hours a week on it"
- ONE sentence of social proof with a specific result: include industry, city, size, and metric.
- CTA: An open-ended question that invites a real conversational response. NOT yes/no, NOT "reply 'send it'".
  - GOOD: "Is intake something your team has talked about fixing, or is it pretty dialed in?"
  - BAD: "Yes or no?", "Reply 'send it'", "Thoughts?"
- End with P.S. containing booking link: "P.S. If easier to just talk: {bookingUrl}"

FRAMEWORK 2 — "Free Teardown":
- Open with "I looked at {company}'s site and mapped out 3 things I'd automate first:"
- List 2-3 bullet points specific to THEIR analysis gaps (not generic). Be concrete about what you'd build.
- One-line proof: a specific case study result with industry, city, and metric.
- CTA: "Want me to send the full breakdown? Takes 2 min to read." (simple reply CTA, conversational — NOT "reply 'send it'")
- End with P.S. containing booking link: "P.S. Or if you'd rather just talk through it: {bookingUrl}"

FRAMEWORK 3 — "Peer Reference":
- Open by referencing what a similar business in their area or industry is doing: "A [industry] practice in [nearby city] just automated their entire [process] — saves them [X hours/week]."
- Connect to THEIR situation using analysis gaps: "Your site shows you're still handling [gap] manually — same spot they were in."
- CTA: Open-ended conversational question. "Curious if this is on your radar at all? Happy to share what they did."
- End with P.S. containing booking link: "P.S. Calendar's here if easier: {bookingUrl}"

CASE STUDIES (use the one that matches their industry; include specifics):
${CASE_STUDIES.map((cs, i) => `${i + 1}. ${cs.name}: ${cs.what}. Result: ${cs.result}.`).join('\n')}
If none match well, use the result numbers without naming the client — but always include a concrete client descriptor (industry + city or size).

HARD RULES (apply to ALL frameworks):
- 100-130 words total. The email must be skimmable in under 15 seconds.
- Start with "Hey {firstName}," — use the first name provided. If the name is "there", use "Hey {company} team," instead. Never "Hi".
- The first sentence after the greeting must reference something CONCRETE about them: their company name, a specific operational gap inferred from the analysis, or an observable fact. Never start with a generic industry stat.
- Every email MUST include the booking URL as a P.S. line at the end. Never bury it in the body or exclude it.
- The CTA must be an open-ended question, NOT a yes/no or command. Ask something they can answer conversationally.
- NEVER use these phrases: "Curious —", "Worth exploring", "I noticed", "I came across", "reaching out", "touching base", "hope this finds you well", "I'd love to", "quick chat", "quick question", "just wanted to", "let me know if", "happy to chat", "thoughts?", "interested?"
- The case study mention must include a specific number AND a specific client descriptor (industry + city or size). Never "a healthcare practice" — always "a 4-provider dental office in Tulsa" or similar.
- Sign off as just "Nathan" — no last name, no company, no title.

Subject line rules:
- 2-6 words, sentence case (capitalize first word only, rest lowercase unless proper noun), no emoji.
- Must create curiosity or feel like it came from a colleague.
- Include a "?" in roughly half of subjects (questions have higher open rates).
- GOOD patterns: "Question about {company}", "{firstName} — quick thought", "Intake at {company}?", "Saw something on your site"
- BAD patterns: "{company} + intake" (looks automated), all-lowercase everything (looks mass-sent), generic keywords ("scheduling headaches")

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
  const company = cleanCompanyName(lead.company || 'Unknown', lead.contact_email);
  let userPrompt = `Write a personalized cold email for this prospect:

Name: ${firstName}
Email: ${lead.contact_email}
Company: ${company}
Website Analysis: ${websiteAnalysis}
Booking URL: ${env.bookingUrl}

Address them as "${firstName}". Use the booking URL naturally in the CTA.`;

  // Variant override: instruct the AI to use a specific framework (1, 2, or 3)
  const frameworkMap = {
    '1': '1 ("Specific Observation + Question")',
    '2': '2 ("Free Teardown")',
    '3': '3 ("Peer Reference")',
  };
  if (frameworkMap[variant]) {
    userPrompt += `\n\nIMPORTANT: You MUST use FRAMEWORK ${frameworkMap[variant]} for this email. Do NOT use any other framework. Follow its structure and CTA rules exactly.`;
  }

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    temperature: 0.6,
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

async function generateForLead(leadId, variant) {
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

  // Generate email — use provided variant, or the lead's existing variant, or let AI pick
  const email = await generateEmailForLead(lead, analysis, variant || lead.email_variant);

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
  const VARIANTS = ['1', '2', '3'];
  let variantCursor = 0;

  for (const lead of leads) {
    try {
      const variant = VARIANTS[variantCursor % VARIANTS.length];
      variantCursor++;
      await generateForLead(lead.id, variant);
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
    const unsubUrl = `https://monkflow.io/api/v1/leadgen/unsubscribe/${unsubToken}`;
    emailHeaders['List-Unsubscribe'] = `<${unsubUrl}>`;
    emailHeaders['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
  }

  // Append tracking pixel and unsub footer if not already in the body
  let htmlBody = lead.ai_email_body;
  if (unsubToken && !htmlBody.includes('track/open/')) {
    const unsubUrl = `https://monkflow.io/api/v1/leadgen/unsubscribe/${unsubToken}`;
    const unsubFooter = `<div style="margin-top:20px;font-size:11px;color:#999;"><p><a href="${unsubUrl}" style="color:#999;">Unsubscribe</a></p></div>`;
    const trackingPixel = `<img src="https://monkflow.io/api/v1/outreach/track/open/${unsubToken}" width="1" height="1" style="display:none" alt="" />`;
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
    from: env.outreachFromEmail,
    to: lead.contact_email,
    subject: lead.ai_email_subject,
    html: htmlBody,
    text: plainText,
    headers: emailHeaders,
  });

  const gmailId = emailResult?.data?.id || emailResult?.id || null;

  // Record in outreach_emails as touch 0 (AI pre-sequence email)
  await query(
    `INSERT INTO outreach_emails (lead_id, touch_number, subject, body, gmail_message_id, variant, delivered_at)
     VALUES ($1, 0, $2, $3, $4, $5, NOW())`,
    [leadId, lead.ai_email_subject, lead.ai_email_body, gmailId, lead.email_variant || '1']
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

This is a FOLLOW-UP email in an existing thread. The prospect received a first email and hasn't replied yet. Each touch has a specific strategy — follow the touch-specific instructions exactly.

CASE STUDIES (pick the one closest to this prospect's industry):
${CASE_STUDIES.map((cs, i) => `${i + 1}. ${cs.name} (${cs.industry}): ${cs.what}. Result: ${cs.result}. Detail: ${cs.detail}.`).join('\n')}

HARD RULES:
- NEVER start with "I" — start with value, a stat, or a question.
- NEVER use "following up", "circling back", "checking in", "bumping this", "just wanted to", "touching base".
- Be conversational, not salesy. Sound like a real person continuing a conversation.
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
  const company = cleanCompanyName(lead.company || '', lead.contact_email);
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
      touchInstruction = `TOUCH 2 — "Value Drop" (NO booking link, NO meeting ask):
- Share something genuinely useful: a relevant industry stat, a process tip, or a specific insight about their business based on their website gaps.
- End with: "No agenda — just thought this might be useful."
- Do NOT include a booking link or ask for a meeting. This email is purely about building trust and showing you're a real person who adds value.
- Under 60 words. 2-3 short paragraphs max.
Subject: Use "Re: ${origSubject}" for email threading.`;
      break;
    case 3:
      touchInstruction = `TOUCH 3 — "Social Proof + Soft Ask" (include booking link):
- Lead with a specific, concrete result from the most relevant case study. Include industry, location, and specific metrics.
- Connect it to their situation based on their website gaps.
- Soft CTA: "If ${company || 'your team'} ever wants to explore this, happy to walk through it"
- Include the booking link casually as a P.S. line: "P.S. Calendar's here: ${env.bookingUrl}"
- Under 70 words. 2-3 short paragraphs.
Subject: Use "Re: ${origSubject}" for email threading — keeps the conversation in one thread.`;
      break;
    case 4:
      touchInstruction = `TOUCH 4 — "Genuine Breakup" (under 40 words, booking link in P.S. only):
- Acknowledge the timing may not be right. Be genuinely warm, not guilt-trippy.
- Keep it SHORT — under 40 words in the main body.
- Example tone: "Totally get if this isn't a priority right now. If it ever comes up, I'm here."
- Include booking link ONLY as a P.S.: "P.S. Calendar's always open: ${env.bookingUrl}"
- Wish them well genuinely.
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
${lead.original_email_body ? `Original email: The first email discussed their specific automation opportunities based on their website analysis.` : ''}

${touchInstruction}`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 512,
    temperature: 0.6,
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
