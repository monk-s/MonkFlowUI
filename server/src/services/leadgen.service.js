const env = require('../config/env');
const leadModel = require('../models/leadgen.model');
const { sendEmail } = require('./email.service');
const { query: dbQuery } = require('../config/database');
const https = require('https');
const http = require('http');
const { URL } = require('url');

// ── Config ──────────────────────────────────────────
const SEARCH_API_KEY = process.env.SEARCHAPI_KEY || process.env.SERPAPI_KEY || '';
// Auto-detect which search API to use based on which env var is set
const SEARCH_API_PROVIDER = process.env.SERPAPI_KEY && !process.env.SEARCHAPI_KEY ? 'serpapi' : 'searchapi';
const SEARCH_API_BASE = SEARCH_API_PROVIDER === 'serpapi'
  ? 'https://serpapi.com/search.json'
  : 'https://www.searchapi.io/api/v1/search';
// ── Domain warming schedule ────────────────────────────
// getmonkflow.com launch date — used to auto-ramp sending volume
const DOMAIN_LAUNCH_DATE = new Date(process.env.DOMAIN_LAUNCH_DATE || '2026-04-01');

function getWarmingLimits() {
  const daysSinceLaunch = Math.floor((Date.now() - DOMAIN_LAUNCH_DATE.getTime()) / (1000 * 60 * 60 * 24));

  if (daysSinceLaunch < 7) {
    // Days 0-6: conservative post-SPF-fix recovery — 10 per sender × 10 = 100/day
    return { daily: 100, perSender: 10, phase: 'warm-1' };
  } else if (daysSinceLaunch < 14) {
    // Days 7-13: gradual ramp — 20 per sender × 10 = 200/day
    return { daily: 200, perSender: 20, phase: 'warm-2' };
  } else if (daysSinceLaunch < 28) {
    // Days 14-27: near full — 25 per sender × 10 = 250/day
    return { daily: 250, perSender: 25, phase: 'warm-3' };
  } else {
    // Day 28+: full capacity — 30 per sender × 10 = 300/day
    return {
      daily: parseInt(process.env.LEADGEN_DAILY_LIMIT, 10) || 300,
      perSender: parseInt(process.env.LEADGEN_PER_SENDER_LIMIT, 10) || 30,
      phase: 'full',
    };
  }
}

// ── Sender health tracking ──��───────────────────────────
async function trackSend(senderEmail) {
  try {
    await dbQuery(
      `INSERT INTO sender_health (sender_email, date, sent_count)
       VALUES ($1, CURRENT_DATE, 1)
       ON CONFLICT (sender_email, date)
       DO UPDATE SET sent_count = sender_health.sent_count + 1`,
      [senderEmail]
    );
  } catch (_) { /* never break pipeline for tracking */ }
}

async function trackBounce(senderEmail) {
  try {
    await dbQuery(
      `INSERT INTO sender_health (sender_email, date, bounce_count)
       VALUES ($1, CURRENT_DATE, 1)
       ON CONFLICT (sender_email, date)
       DO UPDATE SET bounce_count = sender_health.bounce_count + 1`,
      [senderEmail]
    );
  } catch (_) { /* never break pipeline for tracking */ }
}

async function trackComplaint(senderEmail) {
  try {
    await dbQuery(
      `INSERT INTO sender_health (sender_email, date, complaint_count)
       VALUES ($1, CURRENT_DATE, 1)
       ON CONFLICT (sender_email, date)
       DO UPDATE SET complaint_count = sender_health.complaint_count + 1`,
      [senderEmail]
    );
  } catch (_) { /* never break pipeline for tracking */ }
}

async function getHealthySenders() {
  try {
    const { rows } = await dbQuery(
      `SELECT sender_email,
              SUM(sent_count) AS total_sent,
              SUM(bounce_count) AS total_bounces,
              SUM(complaint_count) AS total_complaints
       FROM sender_health
       WHERE date >= CURRENT_DATE - INTERVAL '7 days'
       GROUP BY sender_email
       HAVING SUM(sent_count) > 0`
    );
    // Build a set of unhealthy senders (bounce rate > 5%)
    const unhealthy = new Set();
    for (const row of rows) {
      const bounceRate = (row.total_bounces || 0) / row.total_sent;
      const complaintRate = (row.total_complaints || 0) / row.total_sent;
      if (bounceRate > 0.05 || complaintRate > 0.01) {
        unhealthy.add(row.sender_email);
        console.warn(`[LEADGEN] Sender ${row.sender_email} unhealthy — bounce: ${(bounceRate * 100).toFixed(1)}%, complaint: ${(complaintRate * 100).toFixed(1)}%`);
      }
    }
    // Return only healthy senders from the SENDERS array
    const healthy = SENDERS.filter(s => !unhealthy.has(s.email));
    if (healthy.length === 0) {
      console.error('[LEADGEN] ALL senders unhealthy! Using full list as fallback.');
      return SENDERS;
    }
    return healthy;
  } catch (_) {
    // If health check fails, return all senders
    return SENDERS;
  }
}

// NOTE: DAILY_LIMIT and PER_SENDER_LIMIT are now dynamic via getWarmingLimits()
// Static fallbacks kept only for any external references
const UNSUBSCRIBE_BASE = (env.frontendUrl || 'https://monkflow.io').replace(/\/$/, '');

// Rotate across 10 sender identities to protect deliverability
const SENDERS = [
  { email: 'nathan@getmonkflow.com', name: 'Nathan Linder' },
  { email: 'nate@getmonkflow.com', name: 'Nate Linder' },
  { email: 'nathan.linder@getmonkflow.com', name: 'Nathan Linder' },
  { email: 'n.linder@getmonkflow.com', name: 'Nathan L.' },
  { email: 'outreach@getmonkflow.com', name: 'Nathan at MonkFlow' },
  { email: 'hello@getmonkflow.com', name: 'Nathan from MonkFlow' },
  { email: 'growth@getmonkflow.com', name: 'Nathan — MonkFlow' },
  { email: 'team@getmonkflow.com', name: 'Nathan at MonkFlow' },
  { email: 'connect@getmonkflow.com', name: 'Nathan Linder' },
  { email: 'info@getmonkflow.com', name: 'Nathan at MonkFlow' },
];

const US_CITIES = [
  'Austin TX', 'Denver CO', 'Phoenix AZ', 'Charlotte NC', 'Portland OR',
  'Nashville TN', 'Atlanta GA', 'Tampa FL', 'Raleigh NC', 'Columbus OH',
  'Miami FL', 'San Diego CA', 'Baltimore MD', 'Kansas City MO', 'Pittsburgh PA',
  'Richmond VA', 'Boise ID', 'Albuquerque NM', 'Minneapolis MN', 'Indianapolis IN',
  'Louisville KY', 'Oklahoma City OK', 'Tucson AZ', 'Omaha NE', 'Milwaukee WI',
  'Memphis TN', 'Jacksonville FL', 'Salt Lake City UT', 'Charleston SC',
  'Des Moines IA', 'Little Rock AR', 'Knoxville TN', 'Spokane WA',
  'Greenville SC', 'Lexington KY', 'Baton Rouge LA', 'Chattanooga TN',
  'Savannah GA', 'Asheville NC', 'Boulder CO', 'Tulsa OK', 'Wichita KS',
  'Reno NV', 'Sioux Falls SD', 'Madison WI', 'Scottsdale AZ', 'Fargo ND',
  'Fort Worth TX', 'Sacramento CA', 'Birmingham AL', 'Fresno CA',
  'Anchorage AK', 'Honolulu HI', 'Burlington VT', 'Santa Fe NM',
];

const FIRM_TYPES = [
  { type: 'cpa', queries: ['small CPA firm', 'accounting firm small business', 'CPA tax accountant'] },
  { type: 'law', queries: ['small law firm estate planning', 'family law attorney small firm', 'business attorney small practice'] },
  { type: 'financial', queries: ['financial advisor independent', 'wealth management small firm', 'financial planner independent'] },
  { type: 'dental', queries: ['dental office small practice', 'family dentist private practice', 'dentist office small town'] },
  { type: 'chiropractic', queries: ['chiropractor small practice', 'chiropractic office independent', 'chiropractor private practice'] },
  { type: 'real_estate', queries: ['real estate agent independent', 'small real estate brokerage', 'realtor independent agent'] },
  { type: 'insurance', queries: ['insurance agent independent', 'small insurance agency', 'insurance broker local'] },
  { type: 'veterinary', queries: ['veterinary clinic small', 'vet office private practice', 'animal hospital small'] },
  { type: 'contractor', queries: ['plumbing company small business', 'HVAC contractor local', 'general contractor small business'] },
  { type: 'physical_therapy', queries: ['physical therapy private practice', 'PT clinic independent', 'physical therapist small office'] },
];

const BOOKING_PLATFORMS = [
  'calendly.com', 'acuityscheduling.com', 'hubspot.com/meetings', 'squareup.com/appointments',
  'setmore.com', 'tidycal.com', 'cal.com', 'booksy.com', 'schedulista.com',
  'lawmatics.com', 'clio.com', 'intakeq.com', 'taxdome.com', 'vcita.com',
  'appointlet.com', 'youcanbook.me', 'doodle.com',
];

// ── Helpers ──────────────────────────────────────────

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fetchUrl(url, timeout = 10000, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) return reject(new Error('too many redirects'));
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;
    const MAX_BODY = 5 * 1024 * 1024; // 5MB limit
    const req = lib.get(url, { timeout, headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location, timeout, maxRedirects - 1).then(resolve).catch(reject);
      }
      let data = '';
      let size = 0;
      res.on('data', chunk => {
        size += chunk.length;
        if (size > MAX_BODY) { req.destroy(); return reject(new Error('response too large')); }
        data += chunk;
      });
      res.on('end', () => resolve({ status: res.statusCode, html: data, url: res.responseUrl || url }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function extractEmails(html) {
  // Decode HTML entities first (&#64; = @, &#46; = ., etc.)
  const decoded = html
    .replace(/&#64;/g, '@').replace(/&#46;/g, '.')
    .replace(/\[at\]/gi, '@').replace(/\[dot\]/gi, '.')
    .replace(/ at /g, '@').replace(/ dot /g, '.');

  const matches = decoded.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g) || [];

  // Also extract from mailto: links specifically
  const mailtoMatches = html.match(/mailto:([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/g) || [];
  for (const m of mailtoMatches) {
    matches.push(m.replace('mailto:', ''));
  }

  const filtered = [...new Set(matches)].filter(e => {
    const lower = e.toLowerCase();
    // Filter file extensions that look like emails but aren't
    if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.gif')
      || lower.endsWith('.svg') || lower.endsWith('.webp') || lower.endsWith('.css')
      || lower.endsWith('.js') || lower.endsWith('.map')) return false;
    // Filter known junk/system domains
    if (lower.includes('example.com') || lower.includes('sentry.io')
      || lower.includes('wixpress.com') || lower.includes('wordpress.org')
      || lower.includes('schema.org') || lower.includes('w3.org')
      || lower.includes('googleapis.com') || lower.includes('cloudflare')
      || lower.includes('@sentry') || lower.includes('@email.')) return false;
    // Filter auto-reply and system addresses
    if (lower.includes('noreply') || lower.includes('no-reply')
      || lower.includes('donotreply') || lower.includes('do-not-reply')
      || lower.includes('mailer-daemon') || lower.includes('postmaster@')) return false;
    // Filter placeholder/test emails
    if (lower.startsWith('example@') || lower.startsWith('user@') || lower.startsWith('email@')
      || lower.startsWith('youremail@') || lower.startsWith('your@') || lower.startsWith('name@')
      || lower.startsWith('test@') || lower.startsWith('info@example')
      || lower.includes('@domain.com') || lower.includes('@email.com')
      || lower.includes('@yoursite') || lower.includes('@yourdomain')) return false;
    // Filter large institutions (universities, hospitals, government)
    if (lower.endsWith('.edu') || lower.endsWith('.gov') || lower.endsWith('.mil')
      || lower.includes('ethicspoint.com') || lower.includes('hotline')) return false;
    // Length check
    if (lower.length < 6 || lower.length >= 60) return false;
    return true;
  });
  return filtered;
}

// ── Google Search (supports both SearchAPI.io and SerpAPI.com) ──

async function searchSerpAPI(queryStr) {
  if (!SEARCH_API_KEY) {
    console.warn('[LEADGEN] No SEARCHAPI_KEY or SERPAPI_KEY set, skipping search');
    return [];
  }

  const params = new URLSearchParams({
    q: queryStr,
    api_key: SEARCH_API_KEY,
    engine: 'google',
    num: '15',
    gl: 'us',
    hl: 'en',
  });

  try {
    const resp = await fetchUrl(`${SEARCH_API_BASE}?${params}`, 15000);
    const data = JSON.parse(resp.html);

    // Check for API-level errors (invalid key, rate limit, etc.)
    if (data.error) {
      const errMsg = typeof data.error === 'string' ? data.error : JSON.stringify(data.error);
      console.error(`[LEADGEN] SearchAPI error: ${errMsg}`);
      if (errMsg.toLowerCase().includes('invalid') || errMsg.toLowerCase().includes('unauthorized') || resp.status === 401 || resp.status === 403) {
        throw new Error(`SEARCHAPI_AUTH_FAILURE: ${errMsg}`);
      }
      return [];
    }

    const results = (data.organic_results || []).map(r => ({
      title: r.title || '',
      link: r.link || '',
      snippet: r.snippet || '',
    }));
    return results;
  } catch (err) {
    // Re-throw auth failures so the main orchestrator can abort early
    if (err.message.startsWith('SEARCHAPI_AUTH_FAILURE')) throw err;
    console.error('[LEADGEN] SearchAPI error:', err.message);
    return [];
  }
}

// ── Website Diagnosis ───────────────────────────────

async function diagnoseWebsite(url) {
  const diagnosis = {
    has_ssl: url.startsWith('https'),
    has_booking_software: false,
    booking_software_name: null,
    has_client_portal: false,
    has_intake_forms: false,
    design_age_estimate: 'unknown',
    emails: [],
    issues: [],
  };

  try {
    const mainPage = await fetchUrl(url.startsWith('http') ? url : `https://${url}`, 8000);
    const html = mainPage.html.toLowerCase();

    // Check SSL
    diagnosis.has_ssl = mainPage.url?.startsWith('https') || url.startsWith('https');

    // Check booking software
    for (const platform of BOOKING_PLATFORMS) {
      if (html.includes(platform)) {
        diagnosis.has_booking_software = true;
        diagnosis.booking_software_name = platform.split('.')[0];
        break;
      }
    }
    // Also check for generic booking indicators
    if (!diagnosis.has_booking_software) {
      const bookingIndicators = ['book-a-call', 'book-now', 'schedule-appointment', 'schedule-consultation',
        'onclick="calendly', 'data-calendly', 'acuity-embed'];
      for (const ind of bookingIndicators) {
        if (html.includes(ind)) {
          diagnosis.has_booking_software = true;
          diagnosis.booking_software_name = 'unknown';
          break;
        }
      }
    }

    // Check client portal
    const portalKeywords = ['client portal', 'client login', 'portal login', 'my account', 'secure portal',
      'sharefile', 'smartvault', 'netlinksolution', 'taxdome', 'canopy'];
    diagnosis.has_client_portal = portalKeywords.some(k => html.includes(k));

    // Check intake forms
    const formIndicators = ['intake form', 'new client form', 'get started form', 'onboarding form',
      'client questionnaire', 'lawmatics', 'intakeq', 'jotform', 'typeform'];
    diagnosis.has_intake_forms = formIndicators.some(k => html.includes(k));

    // Design age estimate
    if (html.includes('tailwind') || html.includes('next/static') || html.includes('__next')) {
      diagnosis.design_age_estimate = 'modern';
    } else if (html.includes('bootstrap/5') || html.includes('elementor')) {
      diagnosis.design_age_estimate = 'recent';
    } else if (html.includes('bootstrap/3') || html.includes('jquery-1') || html.includes('flash')) {
      diagnosis.design_age_estimate = 'outdated';
    } else {
      diagnosis.design_age_estimate = 'unknown';
    }

    // Extract emails from main page
    diagnosis.emails.push(...extractEmails(mainPage.html));

    // Try /contact page for more emails
    try {
      const baseUrl = new URL(url.startsWith('http') ? url : `https://${url}`);
      for (const path of ['/contact', '/contact-us']) {
        const contactUrl = `${baseUrl.origin}${path}`;
        const contactPage = await fetchUrl(contactUrl, 6000);
        if (contactPage.status === 200) {
          diagnosis.emails.push(...extractEmails(contactPage.html));
          // Also check contact page for booking
          const chtml = contactPage.html.toLowerCase();
          for (const platform of BOOKING_PLATFORMS) {
            if (chtml.includes(platform)) {
              diagnosis.has_booking_software = true;
              diagnosis.booking_software_name = platform.split('.')[0];
            }
          }
        }
      }
    } catch { /* contact page not found */ }

    diagnosis.emails = [...new Set(diagnosis.emails)];

    // Build issues list
    if (!diagnosis.has_ssl) diagnosis.issues.push('No SSL/HTTPS');
    if (!diagnosis.has_booking_software) diagnosis.issues.push('No online scheduling');
    if (!diagnosis.has_client_portal) diagnosis.issues.push('No client portal');
    if (!diagnosis.has_intake_forms) diagnosis.issues.push('No digital intake forms');
    if (diagnosis.design_age_estimate === 'outdated') diagnosis.issues.push('Outdated website design');

  } catch (err) {
    diagnosis.issues.push(`Website unreachable: ${err.message}`);
  }

  return diagnosis;
}

// ── Claude API: Generate Outreach Email ─────────────

async function generateOutreachEmail(lead, diagnosis, onRetry, variant) {
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: env.anthropicApiKey });

  const prompt = `You are writing a cold email for Nathan, who runs MonkFlow — a dev agency that builds custom automation, client portals, and workflow tools for small businesses.

This email needs to stand out. The recipient gets cold emails daily. Yours must feel different from the "I noticed your website..." template everyone else uses.

BUSINESS INFO:
- Name: ${lead.business_name}
- Type: ${lead.business_type}
- City: ${lead.city}, ${lead.state}
- Website: ${lead.website_url || 'None'}
- Email: ${lead.email}

WEBSITE DIAGNOSIS:
- SSL/HTTPS: ${diagnosis.has_ssl ? 'Yes' : 'No'}
- Online Scheduling: ${diagnosis.has_booking_software ? `Yes (${diagnosis.booking_software_name})` : 'No'}
- Client Portal: ${diagnosis.has_client_portal ? 'Yes' : 'No'}
- Intake Forms: ${diagnosis.has_intake_forms ? 'Yes' : 'No'}
- Design: ${diagnosis.design_age_estimate}
- Issues: ${diagnosis.issues.join(', ') || 'None major'}

STRUCTURE — randomly pick ONE of these two frameworks:

FRAMEWORK A — "Insight Lead":
Open with a specific, useful stat or insight relevant to their industry (e.g., "${lead.business_type} businesses that add online self-scheduling typically see 30-40% fewer no-shows and free up 8-10 hours/week"). Use the diagnosis to make it relevant. Then connect it to a concrete result you've delivered — one sentence. Close with a soft question CTA.

FRAMEWORK B — "Question Lead":
Open with a specific question about their operations they can't ignore (e.g., "Curious — how much of your week goes to [specific task from diagnosis]?"). Then share one concrete result. Close with a soft question CTA.

CASE STUDIES (pick the most relevant):
1. Wealth management firm: automated client onboarding + CRM integration. Cut onboarding from 45 min to under 5.
2. Healthcare practice: online scheduling + automated intake forms. Freed 12 hrs/week, reduced no-shows 35%.
3. E-commerce brand: order-to-fulfillment automation. Eliminated 15 hrs/week of manual processing.

HARD RULES:
- Under 100 words total. 3-4 short paragraphs max.
- Start with "Hey [first name or 'there']," — never "Hi" (too formal for cold email).
- NEVER start the first sentence with "I". Lead with them, a question, or an insight.
- NEVER use: "I noticed your site", "I came across", "I was checking out", "reaching out", "touching base", "hope this finds you well", "I'd love to".
- Subject line: 2-5 words, lowercase, no punctuation. Must feel like a text from a coworker. Good: "{company} + automation", "your booking page", "saving 10 hrs/week". Bad: "idea for your website", "quick thought".
- CTA: one soft question — "Worth a quick chat?" or "Open to exploring this?" NEVER mention "15-minute call" or any specific time commitment.
- Sign off as just "Nathan" — no last name, no company, no URL.
- Case study should be ONE sentence woven in, never its own paragraph.

Return JSON: {"subject": "...", "body": "..."}`;

  // A/B variant override: if a specific variant is requested, instruct the AI accordingly
  let variantInstruction = '';
  if (variant === 'A') {
    variantInstruction = '\n\nIMPORTANT: You MUST use FRAMEWORK A ("Insight Lead") for this email. Do NOT use Framework B.';
  } else if (variant === 'B') {
    variantInstruction = '\n\nIMPORTANT: You MUST use FRAMEWORK B ("Question Lead") for this email. Do NOT use Framework A.';
  }

  const MAX_RETRIES = 5;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt + variantInstruction }],
      });

      const text = response.content[0].text;
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return { ...parsed, variant: variant || 'unknown' };
      }
      return { subject: `Quick question about ${lead.business_name}`, body: text, variant: variant || 'unknown' };
    } catch (err) {
      const isRetryable = err.message.includes('529') || err.message.includes('overloaded') || err.message.includes('rate') || err.status === 529 || err.status === 429;
      if (isRetryable && attempt < MAX_RETRIES) {
        const backoff = attempt * 15000; // 15s, 30s, 45s, 60s
        console.warn(`[LEADGEN] Claude API overloaded (attempt ${attempt}/${MAX_RETRIES}), retrying in ${backoff / 1000}s...`);
        if (onRetry) try { onRetry(attempt, MAX_RETRIES, err.message); } catch (_) {}
        await sleep(backoff);
        continue;
      }
      console.error(`[LEADGEN] Claude API error (attempt ${attempt}/${MAX_RETRIES}):`, err.message);
      throw err; // Let the caller handle it — skip this lead rather than send a generic email
    }
  }
}

// ── Add business days (skip weekends) ─────────────────
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

// ── Score a lead (higher = more gaps = better prospect) ──

function scoreLead(diagnosis) {
  // Guard: if diagnosis has no meaningful properties, return baseline score
  if (!diagnosis || !('has_ssl' in diagnosis || 'has_booking_software' in diagnosis)) return 0;
  let score = 50; // base score

  // Website gap signals (positive = more opportunity)
  if (!diagnosis.has_ssl) score += 5;
  if (!diagnosis.has_booking_software) score += 12;  // big win — highest value service
  if (!diagnosis.has_client_portal) score += 10;
  if (!diagnosis.has_intake_forms) score += 8;
  if (diagnosis.design_age_estimate === 'outdated') score += 8;
  if (diagnosis.design_age_estimate === 'unknown') score += 3;

  // Compound bonus: multiple gaps = better prospect
  const gapCount = [!diagnosis.has_ssl, !diagnosis.has_booking_software, !diagnosis.has_client_portal, !diagnosis.has_intake_forms].filter(Boolean).length;
  if (gapCount >= 3) score += 10; // 3+ gaps = strong prospect
  if (gapCount >= 4) score += 5;  // all gaps = total layup

  // Cap at 0-100
  return Math.max(0, Math.min(100, score));
}

// ── Send Cold Email ─────────────────────────────────

async function sendColdEmail(lead, sender) {
  const unsubUrl = `${UNSUBSCRIBE_BASE}/api/v1/leadgen/unsubscribe/${lead.unsubscribe_token}`;

  const htmlBody = `
    <div style="font-family: -apple-system, sans-serif; max-width: 600px; line-height: 1.6; color: #333;">
      ${lead.outreach_body.split('\n').map(line => line.trim() ? `<p style="margin: 0 0 12px;">${escapeHtml(line)}</p>` : '<br>').join('')}
    </div>
    <div style="margin-top: 24px; padding-top: 16px; border-top: 2px solid #00cc6a;">
      <table cellpadding="0" cellspacing="0" style="font-family: -apple-system, sans-serif;">
        <tr>
          <td style="padding-right: 12px; vertical-align: top;">
            <div style="width: 40px; height: 40px; background: linear-gradient(135deg, #00cc6a, #0a2e1a); border-radius: 8px; text-align: center; line-height: 40px; color: white; font-weight: bold; font-size: 18px;">M</div>
          </td>
          <td style="vertical-align: top;">
            <div style="font-weight: 600; color: #1a1a1a; font-size: 14px;">Nathan Linder</div>
            <div style="color: #666; font-size: 13px;">Founder, <a href="https://getmonkflow.com" style="color: #00cc6a; text-decoration: none;">MonkFlow</a></div>
            <div style="color: #999; font-size: 12px; margin-top: 2px;">AI-powered workflows for small businesses</div>
          </td>
        </tr>
      </table>
    </div>
    <div style="margin-top: 20px; font-size: 11px; color: #999;">
      <p>MonkFlow LLC | 1600 Sayles Blvd, Abilene, TX 79605</p>
      <p><a href="${unsubUrl}" style="color: #999;">Unsubscribe</a></p>
    </div>
    <img src="${(env.apiUrl || 'https://api.getmonkflow.com')}/api/v1/outreach/track/open/${lead.unsubscribe_token}" width="1" height="1" style="display:none" alt="" />
  `;

  // Format the from address: "Display Name <email>"
  const fromAddr = sender ? `${sender.name} <${sender.email}>` : undefined;

  try {
    const replyTo = process.env.LEADGEN_REPLY_TO || 'nate@thelinders.com';

    // Plain-text alternative (improves deliverability — HTML-only emails score higher on spam filters)
    const plainText = `${lead.outreach_body}\n\n--\nNathan Linder\nFounder, MonkFlow\nAI-powered workflows for small businesses\n\nMonkFlow LLC | 1600 Sayles Blvd, Abilene, TX 79605\nUnsubscribe: ${unsubUrl}`;

    const result = await sendEmail({
      to: lead.email,
      subject: lead.outreach_subject,
      html: htmlBody,
      text: plainText,
      from: fromAddr,
      headers: {
        'Reply-To': replyTo,
        'List-Unsubscribe': `<${unsubUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    });

    const emailId = result?.data?.id || result?.id || null;
    if (!emailId) {
      console.warn(`[LEADGEN] No email ID returned from Resend for ${lead.email} — follow-up threading will be broken`);
    }
    await leadModel.update(lead.id, { status: 'sent', sent_at: new Date(), resend_email_id: emailId });

    // ── Bridge: push into outreach_leads for automated follow-up sequence ──
    try {
      const nextFollowup = addBusinessDays(new Date(), 3); // Touch 2 in 3 business days
      const leadScore = scoreLead(lead.diagnosis_json || {});
      await dbQuery(
        `INSERT INTO outreach_leads
          (contact_name, contact_email, company, website_url, source_lead_id,
           status, touch_count, last_sent_at, next_followup_at,
           original_message_id, original_subject, ai_email_subject,
           unsubscribe_token, industry, diagnosis_scores, original_email_body, lead_score,
           email_variant, priority)
         VALUES ($1,$2,$3,$4,$5, 'active',$6,NOW(),$7, $8,$9,$10, $11,$12,$13,$14,$15, $16, $17)
         ON CONFLICT (contact_email) DO NOTHING`,
        [
          lead.business_name,                     // contact_name
          lead.email,                             // contact_email
          lead.business_name,                     // company
          lead.website_url,                       // website_url
          lead.id,                                // source_lead_id
          1,                                      // touch_count (Touch 1 just sent)
          nextFollowup,                           // next_followup_at
          emailId,                                // original_message_id (Resend ID)
          lead.outreach_subject,                  // original_subject
          lead.outreach_subject,                  // ai_email_subject
          lead.unsubscribe_token,                 // unsubscribe_token
          lead.business_type || null,             // industry
          lead.diagnosis_json ? JSON.stringify(lead.diagnosis_json) : null, // diagnosis_scores
          lead.outreach_body || null,             // original_email_body
          leadScore,                              // lead_score
          lead.email_variant || 'A',              // email_variant (A/B test)
          leadScore >= 75,                        // priority (auto-flag high-scoring leads)
        ]
      );
    } catch (bridgeErr) {
      // Never break the pipeline for bridge failures — log and continue
      console.warn(`[LEADGEN] Bridge insert failed for ${lead.email}:`, bridgeErr.message);
    }

    return { success: true, emailId };
  } catch (err) {
    console.error(`[LEADGEN] Failed to send to ${lead.email}:`, err.message);
    return { success: false, error: err.message };
  }
}

// ── Main Orchestrator ───────────────────────────────

async function runDailyLeadGeneration() {
  console.log('[LEADGEN] === Starting daily lead generation ===');
  const pipelineStartTime = Date.now();
  const batchDate = new Date().toISOString().split('T')[0];
  const stats = { searched: 0, discovered: 0, emailsGenerated: 0, emailed: 0, errors: 0 };

  // ── Workflow execution tracking (graceful — never breaks the pipeline) ──
  let workflowId = null;
  let executionId = null;
  let workflowUserId = null;

  async function logExec(level, message, metadata = {}) {
    if (!executionId || !workflowUserId) return;
    try {
      await dbQuery(
        `INSERT INTO execution_logs (user_id, workflow_execution_id, agent_execution_id, level, message, metadata)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [workflowUserId, executionId, null, level, message, JSON.stringify(metadata)]
      );
    } catch (_) { /* never break pipeline for logging */ }
  }

  try {
    const { rows } = await dbQuery(
      `SELECT * FROM workflows WHERE name = $1 LIMIT 1`,
      ['Lead Generation Pipeline']
    );
    if (rows.length > 0) {
      const workflow = rows[0];
      workflowId = workflow.id;
      workflowUserId = workflow.user_id;
      const { rows: execRows } = await dbQuery(
        `INSERT INTO workflow_executions (workflow_id, trigger_type, trigger_payload, status)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [workflowId, 'schedule', JSON.stringify({ batch_date: batchDate }), 'running']
      );
      executionId = execRows[0].id;
      console.log(`[LEADGEN] Workflow execution ${executionId} started for workflow ${workflowId}`);
    }
  } catch (wfErr) {
    console.warn('[LEADGEN] Workflow tracking init skipped:', wfErr.message);
  }

  try {
  // 0. Resume any unsent leads from previous interrupted runs
  const resumeWarming = getWarmingLimits();
  try {
    const { rows: unsentLeads } = await dbQuery(
      `SELECT * FROM leads WHERE status = 'email_generated' AND outreach_subject IS NOT NULL AND outreach_body IS NOT NULL ORDER BY COALESCE(lead_score, 0) DESC, created_at LIMIT $1`,
      [resumeWarming.daily]
    );
    if (unsentLeads.length > 0) {
      console.log(`[LEADGEN] Found ${unsentLeads.length} unsent leads from previous run — sending now (warming phase: ${resumeWarming.phase})`);
      await logExec('info', `Resuming ${unsentLeads.length} unsent leads from previous run`, { count: unsentLeads.length });
      const resumeSenders = await getHealthySenders();
      const senderCounts = new Map(resumeSenders.map(s => [s.email, 0]));
      let senderIdx = 0;
      for (const lead of unsentLeads) {
        let sender = null;
        for (let j = 0; j < resumeSenders.length; j++) {
          const candidate = resumeSenders[(senderIdx + j) % resumeSenders.length];
          if (senderCounts.get(candidate.email) < resumeWarming.perSender) {
            sender = candidate;
            senderIdx = (senderIdx + j + 1) % resumeSenders.length;
            break;
          }
        }
        if (!sender) break;
        const result = await sendColdEmail(lead, sender);
        if (result.success) {
          stats.emailed++;
          senderCounts.set(sender.email, senderCounts.get(sender.email) + 1);
          trackSend(sender.email);
        } else {
          stats.errors++;
        }
        await sleep(1000);
      }
      console.log(`[LEADGEN] Resumed sending complete: ${stats.emailed} sent, ${stats.errors} errors`);
    }
  } catch (resumeErr) {
    console.error('[LEADGEN] Resume unsent error:', resumeErr.message);
    await logExec('error', `Resume unsent leads failed: ${resumeErr.message}`, { error: resumeErr.message });
  }

  // 1. Pick firm types and cities — budget ~140 searches/day to stay under remaining monthly limit
  // 10 firm types × 22 cities = 220 searches/day × 22 weekdays = 4,840/month (of 5,000 limit)
  const cities = shuffle(US_CITIES).slice(0, 22);
  const firmTypes = shuffle(FIRM_TYPES);

  console.log(`[LEADGEN] Targeting: ${firmTypes.map(f => f.type).join(', ')} | Cities: ${cities.length}`);
  await logExec('info', `Search phase starting`, {
    firmTypes: firmTypes.map(f => f.type),
    cityCount: cities.length,
    cities: cities.slice(0, 5),
  });

  // 2. Search for leads — cycle through firm types and cities
  const rawLeads = [];
  let serpApiAborted = false;
  for (const firmType of firmTypes) {
    if (serpApiAborted) break;
    const query = shuffle(firmType.queries)[0];
    for (const city of cities) {
      if (serpApiAborted) break;
      const searchQuery = `${query} ${city} email`;
      try {
        const results = await searchSerpAPI(searchQuery);
        stats.searched += results.length;

        for (const r of results) {
          // Skip directories, yelp, facebook itself, etc.
          if (/yelp|yellowpages|bbb\.org|findlaw|avvo|justia|facebook\.com|linkedin|mapquest|manta\.com|chamberofcommerce/i.test(r.link)) continue;
          // Extract email from snippet if present (Google often shows it)
          const snippetEmails = extractEmails(r.snippet || '');
          rawLeads.push({ ...r, snippetEmails, city, searchQuery, firmType: firmType.type });
        }
      } catch (err) {
        if (err.message.startsWith('SEARCHAPI_AUTH_FAILURE')) {
          console.error('[LEADGEN] ❌ SearchAPI authentication failed — aborting all searches. Check your SEARCHAPI_KEY.');
          await logExec('error', 'SearchAPI authentication failed — aborting searches', { error: err.message });
          stats.errors++;
          serpApiAborted = true;
          break;
        }
        console.error(`[LEADGEN] Search error for "${searchQuery}":`, err.message);
        await logExec('error', `Search error: ${err.message}`, { searchQuery, error: err.message });
        stats.errors++;
      }
      await sleep(1500); // rate limit
    }
  }

  console.log(`[LEADGEN] Raw search results: ${rawLeads.length}`);
  await logExec('info', `Search phase complete`, { rawResultCount: rawLeads.length, searched: stats.searched });

  // 3. Diagnose each website, extract emails, dedup
  const qualifiedLeads = [];
  for (const raw of rawLeads.slice(0, 500)) { // diagnose up to 500 to find ~250 with emails
    try {
      const websiteUrl = raw.link;
      let diagnosis;
      try {
        diagnosis = await diagnoseWebsite(websiteUrl);
      } catch (diagErr) {
        // Website unreachable — still use snippet emails if available
        diagnosis = {
          has_ssl: websiteUrl.startsWith('https'),
          has_booking_software: false, booking_software_name: null,
          has_client_portal: false, has_intake_forms: false,
          design_age_estimate: 'unknown', emails: [], issues: ['Website unreachable'],
        };
      }

      // Merge snippet emails (from Google results) with website emails
      if (raw.snippetEmails && raw.snippetEmails.length > 0) {
        diagnosis.emails = [...new Set([...diagnosis.emails, ...raw.snippetEmails])];
      }

      // Need at least one email
      const bestEmail = diagnosis.emails[0];
      if (!bestEmail) continue;

      // Verify email before adding (pattern + MX check + domain suppression)
      const { verifyEmail } = require('./outreach-ai.service');
      const verification = await verifyEmail(bestEmail);
      if (!verification.valid) {
        console.log(`[LEADGEN] Skipping invalid email ${bestEmail}: ${verification.reason}`);
        continue;
      }
      // Use normalized (lowercased) email from verification
      const cleanEmail = verification.normalizedEmail || bestEmail;

      // Check dedup
      if (await leadModel.emailExists(cleanEmail)) continue;

      // Parse city/state
      const [cityName, stateCode] = raw.city.split(/\s+(?=[A-Z]{2}$)/);

      const lead = {
        business_name: raw.title.replace(/\s*[\|–—].*$/, '').trim(),
        business_type: raw.firmType,
        city: cityName,
        state: stateCode,
        website_url: websiteUrl,
        facebook_url: null,
        email: cleanEmail,
        phone: null,
        ...diagnosis,
        diagnosis_json: diagnosis,
        status: 'diagnosed',
        lead_score: scoreLead(diagnosis),
        priority: (() => { const s = scoreLead(diagnosis); return s >= 75 ? 'HIGH' : s >= 60 ? 'MEDIUM' : 'LOW'; })(),
        batch_date: batchDate,
        search_query: raw.searchQuery,
      };

      const inserted = await leadModel.insert(lead);
      if (inserted) {
        qualifiedLeads.push(inserted);
        stats.discovered++;
      }
    } catch (err) {
      stats.errors++;
      console.error(`[LEADGEN] Error processing ${raw.link}:`, err.message);
      await logExec('error', `Error processing lead: ${err.message}`, { url: raw.link, error: err.message });
    }

    // Progress log every 50 sites
    const idx = rawLeads.indexOf(raw);
    if (idx > 0 && idx % 50 === 0) {
      console.log(`[LEADGEN] Progress: ${idx}/${Math.min(rawLeads.length, 500)} processed, ${qualifiedLeads.length} discovered, ${stats.errors} errors`);
    }

    // Execution log every 100 leads
    if (idx > 0 && idx % 100 === 0) {
      await logExec('info', `Processing progress: ${idx}/${Math.min(rawLeads.length, 500)}`, {
        processed: idx,
        total: Math.min(rawLeads.length, 500),
        discovered: qualifiedLeads.length,
        errors: stats.errors,
      });
    }

    await sleep(1000); // polite crawling
  }

  console.log(`[LEADGEN] Qualified leads: ${qualifiedLeads.length}`);

  // 4. Sort by score (most gaps first), take top leads (warming-aware limit)
  const warming = getWarmingLimits();
  console.log(`[LEADGEN] Domain warming phase: ${warming.phase} — daily limit: ${warming.daily}, per-sender: ${warming.perSender}`);
  qualifiedLeads.sort((a, b) => scoreLead(b.diagnosis_json) - scoreLead(a.diagnosis_json));
  const toEmail = qualifiedLeads.slice(0, warming.daily);

  // 5. Generate personalized outreach via Claude API (with A/B variant assignment)
  // Check current A/B counts to determine split ratio
  let abCounts = { A: 0, B: 0 };
  try {
    const { rows: abRows } = await dbQuery(
      `SELECT email_variant, COUNT(*)::int AS cnt FROM leads WHERE email_variant IS NOT NULL GROUP BY email_variant`
    );
    for (const row of abRows) abCounts[row.email_variant] = row.cnt;
  } catch (_) { /* default to 50/50 if table not migrated yet */ }

  // After 500 sends per variant, auto-promote the winner (80/20 split)
  let abWinner = null;
  if (abCounts.A >= 500 && abCounts.B >= 500) {
    try {
      const { rows: abStats } = await dbQuery(
        `SELECT email_variant,
                COUNT(*) FILTER (WHERE status = 'replied' OR replied_at IS NOT NULL)::numeric / NULLIF(COUNT(*), 0) AS reply_rate
         FROM outreach_leads
         WHERE email_variant IN ('A', 'B') AND touch_count >= 1
         GROUP BY email_variant`
      );
      if (abStats.length === 2) {
        const rateA = abStats.find(r => r.email_variant === 'A')?.reply_rate || 0;
        const rateB = abStats.find(r => r.email_variant === 'B')?.reply_rate || 0;
        abWinner = parseFloat(rateA) >= parseFloat(rateB) ? 'A' : 'B';
        console.log(`[LEADGEN] A/B winner: ${abWinner} (A=${(rateA * 100).toFixed(1)}%, B=${(rateB * 100).toFixed(1)}%)`);
      }
    } catch (_) { /* no winner yet */ }
  }

  await logExec('info', `Email generation starting for ${toEmail.length} leads`, { leadCount: toEmail.length });
  for (const lead of toEmail) {
    try {
      // Assign A/B variant: 50/50 split, or 80/20 if we have a winner
      let variant;
      if (abWinner) {
        variant = Math.random() < 0.8 ? abWinner : (abWinner === 'A' ? 'B' : 'A');
      } else {
        variant = Math.random() < 0.5 ? 'A' : 'B';
      }
      lead.email_variant = variant;

      const { subject, body } = await generateOutreachEmail(lead, lead.diagnosis_json, (attempt, maxRetries, errMsg) => {
        logExec('warn', `Claude API retry attempt ${attempt}/${maxRetries}: ${errMsg}`, { attempt, maxRetries, email: lead.email, error: errMsg });
      }, variant);
      await leadModel.update(lead.id, { outreach_subject: subject, outreach_body: body, status: 'email_generated', email_variant: variant });
      lead.outreach_subject = subject;
      lead.outreach_body = body;
      stats.emailsGenerated++;
    } catch (err) {
      console.error(`[LEADGEN] Email generation error for ${lead.email}:`, err.message);
      await logExec('error', `Email generation failed for ${lead.email}: ${err.message}`, { email: lead.email, error: err.message });
      stats.errors++;
    }
    await sleep(500);
  }

  // 6. Send emails — distribute round-robin across healthy senders (warming-aware per-sender limit)
  const healthySenders = await getHealthySenders();
  console.log(`[LEADGEN] Using ${healthySenders.length}/${SENDERS.length} healthy senders`);
  const senderCounts = new Map(healthySenders.map(s => [s.email, 0]));
  const readyLeads = toEmail.filter(l => l.outreach_subject && l.outreach_body);
  let senderIdx = 0;

  for (let i = 0; i < readyLeads.length; i++) {
    // Find next available sender (one that hasn't hit the per-sender limit)
    let sender = null;
    for (let j = 0; j < healthySenders.length; j++) {
      const candidate = healthySenders[(senderIdx + j) % healthySenders.length];
      if (senderCounts.get(candidate.email) < warming.perSender) {
        sender = candidate;
        senderIdx = (senderIdx + j + 1) % healthySenders.length;
        break;
      }
    }
    if (!sender) { console.log('[LEADGEN] All senders maxed out, stopping.'); break; }

    const result = await sendColdEmail(readyLeads[i], sender);
    if (result.success) {
      stats.emailed++;
      senderCounts.set(sender.email, senderCounts.get(sender.email) + 1);
      trackSend(sender.email); // Track for health monitoring (fire-and-forget)
    } else {
      stats.errors++;
    }
    await sleep(3000); // stagger sends (3s minimum to avoid ISP rate-limiting)
  }

  console.log(`[LEADGEN] Sender distribution: ${[...senderCounts.entries()].map(([e,c]) => `${e}=${c}`).join(', ')}`);

  // 7. Send summary to owner
  try {
    await sendOwnerSummary(batchDate, stats, toEmail);
  } catch (err) {
    console.error('[LEADGEN] Failed to send owner summary:', err.message);
  }

  console.log(`[LEADGEN] === Complete: ${JSON.stringify(stats)} ===`);

  // ── Mark workflow execution as completed ──
  await logExec('info', `Pipeline complete`, stats);
  try {
    if (executionId) {
      const durationMs = Date.now() - pipelineStartTime;
      await dbQuery(
        `UPDATE workflow_executions SET status = $1, result = $2, completed_at = $3, duration_ms = $4 WHERE id = $5`,
        ['completed', JSON.stringify(stats), new Date(), durationMs, executionId]
      );
    }
    if (workflowId) {
      await dbQuery(`
        UPDATE workflows SET
          total_runs = (SELECT COUNT(*) FROM workflow_executions WHERE workflow_id = $1),
          success_rate = COALESCE(
            (SELECT ROUND(COUNT(*) FILTER (WHERE status = 'completed')::decimal / NULLIF(COUNT(*), 0) * 100, 2)
             FROM workflow_executions WHERE workflow_id = $1), 0),
          last_run_at = NOW(),
          updated_at = NOW()
        WHERE id = $1
      `, [workflowId]);
    }
  } catch (wfCompleteErr) {
    console.warn('[LEADGEN] Workflow execution completion tracking failed:', wfCompleteErr.message);
  }

  return stats;

  } catch (pipelineErr) {
    // ── Mark workflow execution as failed ──
    try {
      if (executionId) {
        const durationMs = Date.now() - pipelineStartTime;
        await dbQuery(
          `UPDATE workflow_executions SET status = $1, error_message = $2, completed_at = $3, duration_ms = $4 WHERE id = $5`,
          ['failed', pipelineErr.message, new Date(), durationMs, executionId]
        );
      }
      if (workflowId) {
        await dbQuery(`
          UPDATE workflows SET
            total_runs = (SELECT COUNT(*) FROM workflow_executions WHERE workflow_id = $1),
            success_rate = COALESCE(
              (SELECT ROUND(COUNT(*) FILTER (WHERE status = 'completed')::decimal / NULLIF(COUNT(*), 0) * 100, 2)
               FROM workflow_executions WHERE workflow_id = $1), 0),
            last_run_at = NOW(),
            updated_at = NOW()
          WHERE id = $1
        `, [workflowId]);
      }
    } catch (wfFailErr) {
      console.warn('[LEADGEN] Workflow execution failure tracking failed:', wfFailErr.message);
    }
    // Re-throw so callers still see the error
    throw pipelineErr;
  }
}

async function sendOwnerSummary(batchDate, stats, leads) {
  const ownerEmail = process.env.OWNER_NOTIFICATION_EMAIL || 'nathan@getmonkflow.com';

  const leadsTable = leads.map(l =>
    `<tr><td>${escapeHtml(l.business_name)}</td><td>${escapeHtml(l.city)}, ${escapeHtml(l.state)}</td><td>${escapeHtml(l.email)}</td><td>${l.priority}</td></tr>`
  ).join('');

  await sendEmail({
    to: ownerEmail,
    subject: `[MonkFlow LeadGen] ${stats.emailed} emails sent — ${batchDate}`,
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 700px;">
        <h2 style="color: #00cc6a;">Daily Lead Gen Summary</h2>
        <p><strong>Date:</strong> ${batchDate}</p>
        <div style="display: flex; gap: 20px; margin: 16px 0;">
          <div style="background: #f0f0f0; padding: 12px 20px; border-radius: 8px;">
            <div style="font-size: 24px; font-weight: bold;">${stats.searched}</div><div>Searched</div>
          </div>
          <div style="background: #f0f0f0; padding: 12px 20px; border-radius: 8px;">
            <div style="font-size: 24px; font-weight: bold;">${stats.discovered}</div><div>Discovered</div>
          </div>
          <div style="background: #d5f5e3; padding: 12px 20px; border-radius: 8px;">
            <div style="font-size: 24px; font-weight: bold; color: #1e8449;">${stats.emailed}</div><div>Emailed</div>
          </div>
        </div>
        ${leads.length ? `
          <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
            <tr style="background: #2c3e50; color: white;">
              <th style="padding: 8px; text-align: left;">Business</th>
              <th style="padding: 8px;">Location</th>
              <th style="padding: 8px;">Email</th>
              <th style="padding: 8px;">Priority</th>
            </tr>
            ${leadsTable}
          </table>` : ''}
        ${stats.errors ? `<p style="color: #c0392b;">Errors: ${stats.errors}</p>` : ''}
        ${stats.searched === 0 ? `<div style="background: #ffe0e0; border-left: 4px solid #c0392b; padding: 12px 16px; margin-top: 16px; border-radius: 4px;">
          <strong style="color: #c0392b;">⚠️ Zero search results.</strong> This usually means the SerpAPI key is invalid or expired.
          Check your SEARCHAPI_KEY environment variable and verify it at <a href="https://www.searchapi.io/dashboard">searchapi.io</a>.
        </div>` : ''}
      </div>
    `,
  });
}

module.exports = { runDailyLeadGeneration, diagnoseWebsite, generateOutreachEmail, searchSerpAPI, trackSend, trackBounce, trackComplaint, getHealthySenders, getWarmingLimits };
