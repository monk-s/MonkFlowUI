const env = require('../config/env');
const leadModel = require('../models/leadgen.model');
const { sendEmail } = require('./email.service');
const { query: dbQuery } = require('../config/database');
const { getFirstName, cleanCompanyName } = require('../utils/nameParser');
const pushover = require('./pushover.client');
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
// Use the sending domain for all email links (unsubscribe, tracking) so URLs
// match the From domain — mismatched domains trigger spam filters.
// Tracking pixel + unsubscribe links must use monkflow.io because that's
// where /api/* is proxied to Railway. getmonkflow.com doesn't route /api/*.
const SENDING_DOMAIN_BASE = 'https://monkflow.io';
const UNSUBSCRIBE_BASE = SENDING_DOMAIN_BASE;

// Rotate across 10 sender identities to protect deliverability
// TODO: Once mail.getmonkflow.com DNS is verified on Resend, set
//       OUTREACH_SENDING_DOMAIN=mail.getmonkflow.com in Railway env
//       to migrate senders to the subdomain (protects root domain reputation).
const SENDER_DOMAIN = process.env.OUTREACH_SENDING_DOMAIN || 'getmonkflow.com';
const SENDERS = [
  { email: `nathan@${SENDER_DOMAIN}`, name: 'Nathan Linder' },
  { email: `nate@${SENDER_DOMAIN}`, name: 'Nate Linder' },
  { email: `nathan.linder@${SENDER_DOMAIN}`, name: 'Nathan Linder' },
  { email: `n.linder@${SENDER_DOMAIN}`, name: 'Nathan L.' },
  { email: `outreach@${SENDER_DOMAIN}`, name: 'Nathan at MonkFlow' },
  { email: `hello@${SENDER_DOMAIN}`, name: 'Nathan from MonkFlow' },
  { email: `growth@${SENDER_DOMAIN}`, name: 'Nathan — MonkFlow' },
  { email: `team@${SENDER_DOMAIN}`, name: 'Nathan at MonkFlow' },
  { email: `connect@${SENDER_DOMAIN}`, name: 'Nathan Linder' },
  { email: `info@${SENDER_DOMAIN}`, name: 'Nathan at MonkFlow' },
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
    // Filter obvious non-personal / directory addresses (these still get extracted
    // but will be deprioritized or blocked by verifyEmail — filter the worst here)
    if (lower.startsWith('directory@') || lower.startsWith('webmaster@')
      || lower.startsWith('abuse@') || lower.startsWith('spam@')
      || lower.startsWith('hostmaster@') || lower.startsWith('root@')) return false;
    // Filter large institutions (universities, hospitals, government)
    if (lower.endsWith('.edu') || lower.endsWith('.gov') || lower.endsWith('.mil')
      || lower.includes('ethicspoint.com') || lower.includes('hotline')) return false;
    // Length check
    if (lower.length < 6 || lower.length >= 60) return false;
    return true;
  });
  return filtered;
}

// ── Person name extraction from HTML ──────────────────────────
// Tries to find an actual human name from the page content (attorney profile pages,
// about pages, meta tags, etc.) rather than using the page title as contact_name.

function extractPersonName(html, pageTitle) {
  // 1. Try <meta name="author"> or og:title on attorney profile pages
  const metaAuthor = html.match(/<meta\s[^>]*name=["']author["'][^>]*content=["']([^"']+)["']/i);
  if (metaAuthor) {
    const name = metaAuthor[1].trim();
    if (looksLikePersonName(name)) return name;
  }

  // 2. Try <h1> text — attorney/staff profile pages usually have the name as h1
  const h1Match = html.match(/<h1[^>]*>([^<]{2,60})<\/h1>/i);
  if (h1Match) {
    const name = h1Match[1].replace(/<[^>]*>/g, '').trim();
    if (looksLikePersonName(name)) return name;
  }

  // 3. Try structured data (JSON-LD) for Person type
  const jsonLdMatches = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
  for (const block of jsonLdMatches) {
    try {
      const content = block.replace(/<\/?script[^>]*>/gi, '');
      const data = JSON.parse(content);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (item['@type'] === 'Person' && item.name && looksLikePersonName(item.name)) {
          return item.name.trim();
        }
      }
    } catch { /* invalid JSON-LD */ }
  }

  // 4. Try the page title itself — sometimes it IS a person name (e.g. "John Smith | Law Firm")
  const cleanTitle = pageTitle.replace(/\s*[\|–—:,].*/g, '').trim();
  if (looksLikePersonName(cleanTitle)) return cleanTitle;

  // 5. No person name found — return null (caller falls back to business name)
  return null;
}

function looksLikePersonName(str) {
  if (!str || str.length < 4 || str.length > 50) return false;
  // Must have at least 2 words (first + last name)
  const words = str.trim().split(/\s+/);
  if (words.length < 2 || words.length > 5) return false;
  // Each word should start with uppercase (names are capitalized)
  const allCapitalized = words.every(w => /^[A-Z][a-z]/.test(w) || /^[A-Z]\.?$/.test(w));
  if (!allCapitalized) return false;
  // Reject if it contains business keywords
  const bizWords = /\b(llc|llp|inc|corp|p\.?c\.?|pllc|group|associates|firm|law|legal|office|services|solutions|company|practice|dental|chiropractic|accounting|consultants?|advisors?|partners?|attorneys?|cpas?)\b/i;
  if (bizWords.test(str)) return false;
  // Reject locations (city names that got through)
  const locationWords = /\b(city|county|north|south|east|west|new york|los angeles|san francisco|chicago|houston|phoenix|salt lake|las vegas|charleston)\b/i;
  if (locationWords.test(str)) return false;
  return true;
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

    // Store raw HTML + title for person name extraction (not persisted to DB)
    diagnosis._rawHtml = mainPage.html;
    const titleMatch = mainPage.html.match(/<title[^>]*>([^<]{1,200})<\/title>/i);
    diagnosis._pageTitle = titleMatch ? titleMatch[1].trim() : '';

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
- Name: ${cleanCompanyName(lead.business_name)}
- Contact First Name: ${getFirstName(lead.contact_person, lead.email)}
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

STRUCTURE — use the framework specified below (C, D, E, or F). Each has a distinct voice, opener, and CTA. Follow it exactly.

FRAMEWORK C — "Loom Bait" (low-friction CTA):
- Open with a one-line observation tied to a specific gap from the diagnosis (e.g., "Saw CrossKeys' booking still routes through a contact form — that usually costs 2-3 leads a week").
- One sentence of proof: a blinded but specific case ("A 4-provider dental office in Tulsa now handles their entire intake before the patient walks in — built in 9 days").
- CTA must be a single close-ended interest question (yes/no, no meeting ask, no "thoughts?"). Use this pattern, filling {company}: "Open to a 2-min Loom of exactly how I'd fix this for {company} — yes or no?"
- DO NOT include the booking URL in this variant. One question, one ask, nothing else.

FRAMEWORK D — "Teardown Offer" (direct + value-first):
- Open by naming exactly what you'd build, in 2-3 bullets, based on the diagnosis. Example: "For {company} I'd build: (1) online booking that writes back to your CRM, (2) digital intake forms that auto-populate charts, (3) a client portal for document upload."
- One sentence of social proof with a specific number and a blinded client ("Did this for a 3-provider chiropractic office in Columbus — 11 hrs/week back, 3-week build").
- CTA must be a single close-ended interest ask. Use this pattern: "Should I send the full 5-min teardown? Just reply 'send it'." No meeting ask, no second question.
- DO NOT include the booking URL. Reply-only CTA.

FRAMEWORK E — "Sharp Question" (disqualify, don't sell):
- Open with a disqualifying question that makes them self-select: "Are you the right person to talk to about {company}'s intake/scheduling stack?"
- Then ONE sentence of concrete proof with a named blinded client and a specific number ("We just took a Tulsa dental office from 18 hrs/week on scheduling to under 2 — 3-week build").
- CTA: a single close-ended interest question followed by the calendar link on its own line. Pattern: "Is fixing this a priority for {company} in the next 30 days? If yes: ${env.bookingUrl}". One question, one link.
- This is the only variant that uses the booking link.

FRAMEWORK F — "Cost of Inaction" (numeric stake):
- Open with a cost-of-current-state line grounded in their diagnosis: "Rough math: if your front desk spends ~10 hrs/week on booking and intake at $22/hr, that's ~$11K/year going to paperwork before you count no-shows."
- One sentence of what you'd replace it with, and a blinded client result.
- CTA must be a single close-ended interest question. Pattern: "Want the 2-min breakdown of how I'd cut that number in half? Reply 'yes' and it's in your inbox today." One ask, no meeting request.
- DO NOT include the booking URL. Reply-only CTA.

CASE STUDIES (use one that matches their industry; blind the client name but keep the city/size/number specific):
1. Wealth management firm (4-advisor, Dallas): automated client onboarding + CRM. 45 min → under 5.
2. Dental practice (4-provider, Tulsa): online scheduling + intake forms. 18 hrs/week → 2 hrs/week. Build: 3 weeks.
3. Chiropractic office (3-provider, Columbus): digital intake + scheduling. 11 hrs/week saved.
4. E-commerce brand (Shopify, Austin): order-to-fulfillment automation. 15 hrs/week eliminated.

HARD RULES (apply to ALL frameworks):
- Under 90 words total. The email must be skimmable in under 10 seconds.
- Start with "Hey ${getFirstName(lead.contact_person, lead.email)}," — use this exact name. Never "Hi".
- The first sentence after the greeting must reference something CONCRETE about them: their company name, a specific gap from the diagnosis, or an observable fact. Never start with a generic industry stat.
- NEVER use these phrases: "Curious —", "Worth exploring", "I noticed", "I came across", "reaching out", "touching base", "hope this finds you well", "I'd love to", "quick chat", "quick question", "just wanted to", "let me know if", "happy to", "looking forward".
- The case study line must include a specific number AND a specific blinded client descriptor (size + city or industry). Never "a healthcare practice" — always "a 4-provider dental office in Tulsa" or similar.
- Subject line: 2-5 words, lowercase, no punctuation, no emoji. Must reference something specific to them (company name, a word from their niche, or the gap). Good: "{company} + intake", "your booking page", "tulsa dental automation". Bad: "scheduling headaches", "quick thought".
- Sign off as just "Nathan" — no last name, no company, no title.

Return JSON: {"subject": "...", "body": "..."}`;

  // Variant → framework mapping. Each variant hard-locks the AI to one framework.
  const frameworkMap = {
    C: 'C ("Loom Bait")',
    D: 'D ("Teardown Offer")',
    E: 'E ("Sharp Question")',
    F: 'F ("Cost of Inaction")',
  };
  let variantInstruction = '';
  if (frameworkMap[variant]) {
    variantInstruction = `\n\nIMPORTANT: You MUST use FRAMEWORK ${frameworkMap[variant]} for this email. Do NOT use any other framework. Follow its CTA rules exactly — especially whether or not to include the booking URL.`;
  }

  const MAX_RETRIES = 5;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Hard 60s timeout — prevents silent hangs that stall the whole cron run
      const response = await Promise.race([
        client.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 500,
          messages: [{ role: 'user', content: prompt + variantInstruction }],
        }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('Claude API timeout after 60s')), 60000)),
      ]);

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
      ${lead.outreach_body.split('\n').map(line => {
        if (!line.trim()) return '<br>';
        const escaped = escapeHtml(line);
        const linked = escaped.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#00cc6a;text-decoration:none;font-weight:600;">$1</a>');
        return `<p style="margin: 0 0 12px;">${linked}</p>`;
      }).join('')}
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
    <img src="${SENDING_DOMAIN_BASE}/api/v1/outreach/track/open/${lead.unsubscribe_token}" width="1" height="1" style="display:none" alt="" />
  `;

  // Format the from address: "Display Name <email>"
  const fromAddr = sender ? `${sender.name} <${sender.email}>` : undefined;

  try {
    const replyTo = process.env.LEADGEN_REPLY_TO || 'nathan@mail.getmonkflow.com';

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
          lead.contact_person || lead.business_name, // contact_name (prefer real person name)
          lead.email,                             // contact_email
          lead.business_name,                     // company (always the business name)
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
          lead.email_variant || 'C',              // email_variant (C/D/E/F rotation; fallback C)
          leadScore >= 75,                        // priority (auto-flag high-scoring leads)
        ]
      );
    } catch (bridgeErr) {
      // Never break the pipeline for bridge failures — log and continue
      console.warn(`[LEADGEN] Bridge insert failed for ${lead.email}:`, bridgeErr.message);
    }

    // ── Mirror into outreach_emails so analytics dashboards see this send ──
    try {
      await dbQuery(
        `INSERT INTO outreach_emails (lead_id, touch_number, subject, body, gmail_message_id, variant, sent_at, delivered_at)
         SELECT id, 0, $2, $3, $4, $5, NOW(), NOW()
         FROM outreach_leads WHERE contact_email = $1
         LIMIT 1`,
        [lead.email, lead.outreach_subject, lead.outreach_body || '', emailId, lead.email_variant || 'B']
      );
    } catch (mirrorErr) {
      console.warn(`[LEADGEN] outreach_emails mirror failed for ${lead.email}:`, mirrorErr.message);
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

  // 0b. Recover leads stuck in 'diagnosed' status (personalization never
  // completed on a previous run — e.g. Claude API hang). Re-personalize
  // and send inline, capped so they can't eat the whole daily quota.
  try {
    const RECOVERY_CAP = Math.max(0, Math.floor(resumeWarming.daily / 2));
    if (RECOVERY_CAP > 0) {
      const { rows: stuckLeads } = await dbQuery(
        `SELECT * FROM leads
         WHERE status = 'diagnosed'
           AND diagnosis_json IS NOT NULL
           AND (outreach_subject IS NULL OR outreach_body IS NULL)
         ORDER BY COALESCE(lead_score, 0) DESC, created_at
         LIMIT $1`,
        [RECOVERY_CAP]
      );
      if (stuckLeads.length > 0) {
        console.log(`[LEADGEN] Recovering ${stuckLeads.length} leads stuck in 'diagnosed' status`);
        await logExec('info', `Recovering ${stuckLeads.length} stuck 'diagnosed' leads`, { count: stuckLeads.length });
        const recSenders = await getHealthySenders();
        const recCounts = new Map(recSenders.map(s => [s.email, 0]));
        let recIdx = 0;
        const REC_VARIANTS = ['C', 'D', 'E', 'F'];
        let recVariantCursor = 0;
        for (const lead of stuckLeads) {
          // Skip nameless leads — don't send "Hey there" blasts
          const fn = getFirstName(lead.contact_person, lead.email);
          if (!fn || fn === 'there') {
            try { await dbQuery(`UPDATE leads SET status = 'skipped_no_name' WHERE id = $1`, [lead.id]); } catch (_) {}
            continue;
          }
          try {
            const variant = REC_VARIANTS[recVariantCursor % REC_VARIANTS.length];
            recVariantCursor++;
            const { subject, body } = await generateOutreachEmail(lead, lead.diagnosis_json, null, variant);
            await leadModel.update(lead.id, { outreach_subject: subject, outreach_body: body, status: 'email_generated', email_variant: variant });
            lead.outreach_subject = subject;
            lead.outreach_body = body;
            lead.email_variant = variant;
            stats.emailsGenerated++;
          } catch (genErr) {
            console.error(`[LEADGEN] Recovery personalization failed for ${lead.email}:`, genErr.message);
            stats.errors++;
            await sleep(500);
            continue;
          }
          // Send it now
          let sender = null;
          for (let j = 0; j < recSenders.length; j++) {
            const cand = recSenders[(recIdx + j) % recSenders.length];
            if (recCounts.get(cand.email) < resumeWarming.perSender) {
              sender = cand;
              recIdx = (recIdx + j + 1) % recSenders.length;
              break;
            }
          }
          if (!sender) { console.log('[LEADGEN] Recovery: senders maxed, stopping'); break; }
          const result = await sendColdEmail(lead, sender);
          if (result.success) {
            stats.emailed++;
            recCounts.set(sender.email, recCounts.get(sender.email) + 1);
            trackSend(sender.email);
          } else {
            stats.errors++;
          }
          await sleep(1000);
        }
        console.log(`[LEADGEN] Recovery complete: ${stats.emailed} total sent so far`);
      }
    }
  } catch (recErr) {
    console.error('[LEADGEN] Diagnosed recovery error:', recErr.message);
    await logExec('error', `Diagnosed recovery failed: ${recErr.message}`, { error: recErr.message });
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

      // Need at least one email — prefer personal emails over generic role addresses
      const ROLE_PREFIXES = /^(info|support|contact|admin|office|sales|help|billing|legal|hr|marketing|hello|general|team|directory|reception|inquiries|enquiries|careers|jobs|media|press|service|feedback|accounts|mail|staff)@/i;
      const sortedEmails = [...diagnosis.emails].sort((a, b) => {
        const aIsRole = ROLE_PREFIXES.test(a);
        const bIsRole = ROLE_PREFIXES.test(b);
        if (aIsRole && !bIsRole) return 1;   // personal emails first
        if (!aIsRole && bIsRole) return -1;
        return 0;                             // preserve original order otherwise
      });
      const bestEmail = sortedEmails[0];
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

      // Try to extract a real person name from the page HTML (for personalized outreach)
      const businessName = raw.title.replace(/\s*[\|–—].*$/, '').trim();
      const personName = diagnosis._rawHtml
        ? extractPersonName(diagnosis._rawHtml, diagnosis._pageTitle || raw.title)
        : null;

      // Clean up internal fields before persisting
      delete diagnosis._rawHtml;
      delete diagnosis._pageTitle;

      const lead = {
        business_name: businessName,
        contact_person: personName, // actual person name (may be null)
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

  // 5. Generate personalized outreach via Claude API (4-way C/D/E/F rotation)

  // Filter out leads where we can't find a real first name. Sending "Hey there"
  // tanks reply rate — previous data showed 25% of sends going to "Hey there"
  // with 0 replies. Better to skip than blast generic greetings.
  const beforeFilter = toEmail.length;
  const skippedNoName = [];
  const withName = [];
  for (const lead of toEmail) {
    const fn = getFirstName(lead.contact_person, lead.email);
    if (!fn || fn === 'there') {
      skippedNoName.push(lead);
    } else {
      withName.push(lead);
    }
  }
  if (skippedNoName.length > 0) {
    console.log(`[LEADGEN] Skipping ${skippedNoName.length}/${beforeFilter} leads with no identifiable first name (would send "Hey there")`);
    await logExec('info', `Skipped ${skippedNoName.length} nameless leads`, { count: skippedNoName.length, total: beforeFilter });
    // Mark them so we don't re-process tomorrow
    try {
      const ids = skippedNoName.map(l => l.id);
      if (ids.length > 0) {
        await dbQuery(`UPDATE leads SET status = 'skipped_no_name' WHERE id = ANY($1::int[])`, [ids]);
      }
    } catch (_) {}
  }
  // Use the name-filtered list from here on
  toEmail.length = 0;
  toEmail.push(...withName);

  await logExec('info', `Email generation starting for ${toEmail.length} leads`, { leadCount: toEmail.length });
  // A/B/C/D test: distribute evenly across 4 new frameworks (C, D, E, F).
  // Previous variants A and B are retired — existing data preserved for
  // historical comparison. Round-robin ensures exact 25% split per run.
  const TEST_VARIANTS = ['C', 'D', 'E', 'F'];
  let variantCursor = 0;
  for (const lead of toEmail) {
    try {
      const variant = TEST_VARIANTS[variantCursor % TEST_VARIANTS.length];
      variantCursor++;
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

  pushover.sendDailySummary({
    scheduler: 'LeadGen (Email)',
    lines: [
      `Searched: ${stats.searched}`,
      `Discovered: ${stats.discovered}`,
      `Emailed: ${stats.emailed}`,
      stats.errors ? `⚠️ Errors: ${stats.errors}` : null,
    ],
    url: `${env.frontendUrl}/admin`,
  }).catch(() => {});

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
    pushover.sendSchedulerFailure({ scheduler: 'LeadGen (Email)', error: pipelineErr.message }).catch(() => {});
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

module.exports = { runDailyLeadGeneration, diagnoseWebsite, generateOutreachEmail, searchSerpAPI, trackSend, trackBounce, trackComplaint, getHealthySenders, getWarmingLimits, scoreLead, FIRM_TYPES, US_CITIES };
