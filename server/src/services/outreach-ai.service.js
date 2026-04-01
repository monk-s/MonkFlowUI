const env = require('../config/env');
const { query } = require('../config/database');
const { sendEmail } = require('./email.service');
const dns = require('dns');
const { promisify } = require('util');
const https = require('https');
const http = require('http');
const { URL } = require('url');

const resolveMx = promisify(dns.resolveMx);

// ── Case study reference ───────────────────────────────────
const CASE_STUDY = {
  name: 'Team Financial Strategies',
  industry: 'wealth management',
  what: 'automated client onboarding contract system with CRM integration',
  result: 'eliminated manual data entry and cut new client onboarding time from 45 minutes to under 5',
  detail: 'custom contract form that auto-populates their Redtail CRM, generates signed agreements as PDFs, and syncs client financial profiles — all without a single spreadsheet',
};

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

const SYSTEM_PROMPT = `You are an expert cold email copywriter for MonkFlow, a software development agency that builds custom automation tools, client portals, and workflow software for small-to-mid-sized businesses.

Your job: write a hyper-personalized cold email based on the prospect's website analysis.

RULES:
- Keep it under 120 words. Short paragraphs. Conversational, not salesy.
- Open with something specific you noticed about THEIR business (from the website analysis). Never generic.
- Identify 1-2 pain points based on what you see (manual processes, no online booking, no client portal, etc.)
- Naturally mention the case study: "${CASE_STUDY.name}" — ${CASE_STUDY.what}. Result: ${CASE_STUDY.result}.
- The case study mention should feel organic, not forced. One sentence max.
- End with a soft CTA — "open to a quick chat?" or "worth a conversation?" energy. No hard sells.
- Sign off as "Nathan" (not Nathan Linder, just Nathan)
- Subject line: short, lowercase, personal. No "RE:" or fake reply threading.

OUTPUT FORMAT: Return valid JSON only, no markdown:
{"subject": "...", "body": "..."}

The body should be plain text with \\n for line breaks (will be converted to HTML for sending).`;

async function generateEmailForLead(lead, websiteAnalysis) {
  if (!env.anthropicApiKey) {
    console.log('[OUTREACH-AI] No Anthropic API key — returning mock email');
    return {
      subject: `quick thought about ${lead.company || 'your business'}`,
      body: `Hey ${(lead.contact_name || '').split(' ')[0] || 'there'},\n\nMock AI email — set ANTHROPIC_API_KEY to generate real ones.\n\nNathan`,
    };
  }

  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: env.anthropicApiKey });

  const firstName = (lead.contact_name || '').split(' ')[0] || 'there';
  const userPrompt = `Write a personalized cold email for this prospect:

Name: ${lead.contact_name}
Email: ${lead.contact_email}
Company: ${lead.company || 'Unknown'}
Website Analysis: ${websiteAnalysis}

Address them as "${firstName}".`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    temperature: 0.7,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const text = response.content[0]?.text || '';

  // Parse JSON from response
  try {
    // Try direct parse first
    const parsed = JSON.parse(text);
    return { subject: parsed.subject, body: parsed.body };
  } catch {
    // Try extracting JSON from markdown code block
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return { subject: parsed.subject, body: parsed.body };
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
     WHERE priority = true AND status = 'active' AND ai_email_body IS NULL
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

  const emailResult = await sendEmail({
    to: lead.contact_email,
    subject: lead.ai_email_subject,
    html: lead.ai_email_body,
  });

  const gmailId = emailResult?.data?.id || emailResult?.id || null;

  // Record in outreach_emails as touch 0 (AI pre-sequence email)
  await query(
    `INSERT INTO outreach_emails (lead_id, touch_number, subject, body, gmail_message_id)
     VALUES ($1, 0, $2, $3, $4)`,
    [leadId, lead.ai_email_subject, lead.ai_email_body, gmailId]
  );

  // Mark as sent
  await query(
    `UPDATE outreach_leads SET ai_email_sent_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [leadId]
  );

  return { sent: true, to: lead.contact_email };
}

// ── Email verification ─────────────────────────────────────

const BAD_PATTERNS = [
  /^test@/i, /^admin@example/i, /^user@/i, /^noreply@/i,
  /^filler@/i, /^johndoe@/i, /^jsmith@/i, /^demo@/i,
  /@example\.(com|org|net)$/i, /@test\./i, /@invalid$/i,
  /^.{60,}@/,  // Extremely long local parts (garbled data)
  /[+=%].*@/,  // Encoded characters in local part
];

const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'tempmail.com', 'throwaway.email',
  'yopmail.com', '10minutemail.com', 'trashmail.com',
]);

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

  // MX record check
  try {
    const records = await Promise.race([
      resolveMx(domain),
      new Promise((_, reject) => setTimeout(() => reject(new Error('MX timeout')), 5000)),
    ]);
    if (!records || records.length === 0) {
      return { valid: false, reason: 'No MX records — domain cannot receive email' };
    }
  } catch (err) {
    if (err.message === 'MX timeout') {
      // Optimistic: treat timeout as valid
      return { valid: true, reason: 'MX lookup timed out — assuming valid' };
    }
    if (err.code === 'ENOTFOUND' || err.code === 'ENODATA') {
      return { valid: false, reason: 'Domain does not exist' };
    }
    // Other DNS errors — be optimistic
    return { valid: true, reason: `DNS check inconclusive: ${err.message}` };
  }

  return { valid: true, reason: 'OK' };
}

module.exports = {
  analyzeWebsite,
  generateForLead,
  generateForAllPriority,
  sendAiEmail,
  verifyEmail,
  generateEmailForLead,
  CASE_STUDY,
};
