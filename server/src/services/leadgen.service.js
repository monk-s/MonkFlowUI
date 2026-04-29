const env = require('../config/env');
const leadModel = require('../models/leadgen.model');
const { sendEmail } = require('./email.service');
const { query: dbQuery } = require('../config/database');
const { getFirstName, cleanCompanyName, NAME_BLOCKLIST } = require('../utils/nameParser');
const { CASE_STUDIES } = require('./outreach-ai.service');
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
// Reset date for mail.getmonkflow.com subdomain — previous sends on root domain
// had 20-40% bounce rates on several senders, poisoning reputation.
// Conservative ramp: 3 senders × perSender = daily total.
const DOMAIN_LAUNCH_DATE = new Date(process.env.DOMAIN_LAUNCH_DATE || '2026-04-10');

function getWarmingLimits() {
  const daysSinceLaunch = Math.floor((Date.now() - DOMAIN_LAUNCH_DATE.getTime()) / (1000 * 60 * 60 * 24));

  if (daysSinceLaunch < 7) {
    // Days 0-6: very conservative — 5 per sender × 3 = 15/day
    return { daily: 15, perSender: 5, phase: 'warm-1' };
  } else if (daysSinceLaunch < 14) {
    // Days 7-13: light ramp — 10 per sender × 3 = 30/day
    return { daily: 30, perSender: 10, phase: 'warm-2' };
  } else if (daysSinceLaunch < 21) {
    // Days 14-20: moderate — 20 per sender × 3 = 60/day
    return { daily: 60, perSender: 20, phase: 'warm-3' };
  } else if (daysSinceLaunch < 28) {
    // Days 21-27: near full — 25 per sender × 3 = 75/day
    return { daily: 75, perSender: 25, phase: 'warm-4' };
  } else {
    // Day 28+: full capacity. Both ceilings come from env.js (single source of
    // truth — was previously a second `process.env.*` parse here that
    // disagreed with env.js defaults). Override via Railway env vars.
    return {
      daily: env.leadgenDailyLimit,
      perSender: env.leadgenPerSenderLimit,
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
    // Require a minimum sample before judging — a new sender with 2 bounces
    // out of 10 sends (20%) would otherwise be permanently excluded on signal
    // that's statistical noise. 20-send floor keeps the check honest.
    const MIN_SENDS_FOR_HEALTH_CHECK = 20;
    const unhealthy = new Set();
    for (const row of rows) {
      const totalSent = Number(row.total_sent) || 0;
      if (totalSent < MIN_SENDS_FOR_HEALTH_CHECK) continue;
      const bounceRate = (row.total_bounces || 0) / totalSent;
      const complaintRate = (row.total_complaints || 0) / totalSent;
      if (bounceRate > 0.05 || complaintRate > 0.01) {
        unhealthy.add(row.sender_email);
        console.warn(`[LEADGEN] Sender ${row.sender_email} unhealthy — bounce: ${(bounceRate * 100).toFixed(1)}%, complaint: ${(complaintRate * 100).toFixed(1)}% (${totalSent} sends)`);
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

// 6 personal sender identities on the dedicated outreach subdomain.
// Domain-level DKIM/SPF on mail.getmonkflow.com covers all local-parts — no
// per-address verification needed in Resend. All names follow the founder's
// real name pattern (Nathan/Nate Linder) so they read as genuine humans.
// Role-based addresses (outreach@, hello@, team@, etc.) intentionally excluded —
// they're a spam signal and the system's own BAD_PATTERNS would reject them on receive.
const SENDER_DOMAIN = process.env.OUTREACH_SENDING_DOMAIN || 'mail.getmonkflow.com';

// REPUTATION REBUILD WINDOW (started 2026-04-29):
//
// Three of the original six senders are sunset during the rebuild. Spreading
// volume across 6 means each sender does ~5/day at warm-1, which is below
// the threshold for Gmail's per-address reputation system to register a
// reliable signal. Concentrating on 3 senders means each does ~10/day —
// 210 sends per sender over a 21-day rebuild, enough to actually move the
// needle.
//
// The 3 most-natural-looking local-parts stay active. Re-enable the
// commented three (`n.linder`, `nathanl`, `nlinder`) at Day 28+ if Gmail
// human-open rate is sustained ≥10% — at that point the senders need to
// re-warm naturally, which is fine because their historical reputation
// is essentially neutral (low volume, no recent complaints).
const SENDERS = [
  { email: `nathan@${SENDER_DOMAIN}`, name: 'Nathan Linder' },
  { email: `nate@${SENDER_DOMAIN}`, name: 'Nate Linder' },
  { email: `nathan.linder@${SENDER_DOMAIN}`, name: 'Nathan Linder' },
  // { email: `n.linder@${SENDER_DOMAIN}`,  name: 'Nathan Linder' }, // REBUILD: re-enable Day 28+ if Gmail open-rate ≥10%
  // { email: `nathanl@${SENDER_DOMAIN}`,   name: 'Nathan Linder' }, // REBUILD: re-enable Day 28+ if Gmail open-rate ≥10%
  // { email: `nlinder@${SENDER_DOMAIN}`,   name: 'Nathan Linder' }, // REBUILD: re-enable Day 28+ if Gmail open-rate ≥10%
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

// Narrowed to 3 industries that match existing case studies and have the
// strongest product-market fit. Depth > breadth for personalization quality.
const FIRM_TYPES = [
  { type: 'cpa', queries: ['"CPA firm" "contact us" -yelp -yellowpages', '"accounting firm" "meet our team" -bbb -avvo', 'small CPA firm'] },
  { type: 'dental', queries: ['"family dentistry" "contact us" -yelp -yellowpages', '"dental practice" "meet our team" -healthgrades', 'dental office small practice'] },
  { type: 'financial', queries: ['"financial advisor" "contact us" -yelp -yellowpages', '"wealth management" "our team" -investopedia', 'financial advisor independent'] },
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

// Scraping-side helper: true only if `str` is plausibly a 2+ word PERSON name.
// (The single-word branch lives in nameParser.getFirstName.) Shares NAME_BLOCKLIST
// with nameParser so industry/marketing words can't leak in via a fake "Santa
// Smith" first-word match.
function looksLikePersonName(str) {
  if (!str || str.length < 4 || str.length > 50) return false;
  // Must have at least 2 words (first + last name)
  const words = str.trim().split(/\s+/);
  if (words.length < 2 || words.length > 5) return false;
  // Each word should start with uppercase (names are capitalized)
  const allCapitalized = words.every(w => /^[A-Z][a-z]/.test(w) || /^[A-Z]\.?$/.test(w));
  if (!allCapitalized) return false;
  // Reject if the first word is in the shared NAME_BLOCKLIST (industry/marketing
  // terms like "Santa", "Plumber", "Best", "Trusted" that the rest of the regex
  // wouldn't catch).
  if (NAME_BLOCKLIST.has(words[0].toLowerCase())) return false;
  // Reject if it contains business keywords
  const bizWords = /\b(llc|llp|inc|corp|p\.?c\.?|pllc|group|associates|firm|law|legal|office|services|solutions|company|practice|dental|chiropractic|accounting|consultants?|advisors?|partners?|attorneys?|cpas?)\b/i;
  if (bizWords.test(str)) return false;
  // Reject locations (city names that got through)
  const locationWords = /\b(city|county|north|south|east|west|new york|los angeles|san francisco|chicago|houston|phoenix|salt lake|las vegas|charleston)\b/i;
  if (locationWords.test(str)) return false;
  // Reject strings with exclamation/question marks (page titles, CTAs)
  if (/[!?]/.test(str)) return false;
  // Reject ALL-CAPS words (e.g. "TEAM", "CLICK HERE")
  if (words.some(w => w.length > 2 && w === w.toUpperCase())) return false;
  // Reject CTA/web phrases that slip through as "names"
  const ctaPhrases = /\b(allow|discover|attention|required|click|learn|explore|submit|request|start|join|opportunities|free|limited|exclusive)\b/i;
  if (ctaPhrases.test(str)) return false;
  // Reject common nouns used as first word
  const commonNouns = /^(team|staff|admin|office|home|about|contact|service|support|help|welcome|schedule)$/i;
  if (commonNouns.test(words[0])) return false;
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

/**
 * Deterministically picks the right case study based on a lead's business_type.
 * Replaces the old approach of dumping all four cases into the prompt and asking
 * the AI to pick — which failed in production (dental leads were consistently
 * sent the Dallas financial services case study).
 */
function selectCaseStudy(businessType) {
  const t = (businessType || '').toLowerCase();
  if (/dent/.test(t)) return CASE_STUDIES.find(c => /dental/i.test(c.industry));
  if (/chiro/.test(t)) return CASE_STUDIES.find(c => /chiropractic/i.test(c.industry));
  if (/financial|wealth|advisor|cpa|accounting|tax|ria/.test(t)) {
    return CASE_STUDIES.find(c => /wealth|financial/i.test(c.industry));
  }
  if (/ecommerce|e-commerce|retail|shopify|shop|store/.test(t)) {
    return CASE_STUDIES.find(c => /e-commerce|retail/i.test(c.industry));
  }
  // Generic fallback — e-commerce case study is the most broadly applicable
  return CASE_STUDIES.find(c => /e-commerce/i.test(c.industry)) || CASE_STUDIES[0];
}

/**
 * Returns true if a subject line's "template shape" has been used 5+ times
 * in the last 30 days. Strips proper nouns so "Quick question about Acme"
 * and "Quick question about Beta" collapse to the same shape.
 * Used to prevent spam-filter pattern detection.
 */
async function subjectIsOverused(subject) {
  if (!subject || typeof subject !== 'string') return false;
  try {
    // Uses the indexed `subject_shape` generated column from migration 045.
    // The normalize_subject_shape() PG function is the single source of
    // truth for the normalization rule — JS doesn't recompute the shape,
    // it just passes the raw subject through and lets PG normalize on both
    // sides via the same function. Keeps JS and the stored column in
    // lockstep across future rule changes.
    const { rows } = await dbQuery(
      `SELECT COUNT(*)::int AS n
         FROM outreach_emails
        WHERE touch_number = 0
          AND sent_at > NOW() - INTERVAL '30 days'
          AND subject_shape = normalize_subject_shape($1)`,
      [subject]
    );
    return rows[0].n >= 5;
  } catch (err) {
    // On DB error, don't block the send — just log and let it through.
    // Common cause if this fires post-deploy: migration 045 hasn't run yet.
    console.warn('[LEADGEN] subjectIsOverused query failed:', err.message);
    return false;
  }
}

async function generateOutreachEmail(lead, diagnosis, onRetry, variant) {
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: env.anthropicApiKey });

  // Pre-compute values used throughout the prompt — avoids re-running
  // cleanCompanyName/getFirstName in every template interpolation.
  const company = cleanCompanyName(lead.business_name, lead.email);
  const firstName = getFirstName(lead.contact_person, lead.email);
  const hasRealName = firstName && firstName !== 'there';
  const caseStudy = selectCaseStudy(lead.business_type);
  // Short industry label for the signature line
  const shortIndustry = (() => {
    const t = (lead.business_type || '').toLowerCase();
    if (/dent/.test(t)) return 'dental practices';
    if (/chiro/.test(t)) return 'chiropractic offices';
    if (/financial|wealth|advisor|cpa|accounting|tax/.test(t)) return 'financial advisors';
    if (/ecommerce|e-commerce|retail|shopify/.test(t)) return 'e-commerce brands';
    return 'small businesses';
  })();

  const bookingUrl = env.bookingUrl;
  // Belt-and-suspenders: if BOOKING_URL isn't configured (local dev or Railway
  // misconfig), skip the PS line entirely rather than send PLACEHOLDER to
  // prospects. env.js ALSO hard-refuses to boot in prod with a placeholder, so
  // this is a second line of defense for dev/staging / partial config drift.
  const includePs = !env.bookingUrlIsPlaceholder();

  const prompt = `You are writing a cold email for Nathan, founder of MonkFlow — a solo dev agency building custom automation, client portals, and workflow tools for small businesses.

GOAL: ONE REPLY. The offer is a named deliverable — a 1-page map of the 3 highest-ROI automations for this prospect's practice type. They reply "send it" and receive the PDF. No call required. They keep it regardless.

BUSINESS INFO:
- Company: ${company}
- First name (if real): ${hasRealName ? firstName : '(none — omit greeting entirely)'}
- Type: ${lead.business_type}
- City: ${lead.city}, ${lead.state}

WEBSITE DIAGNOSIS (infer PAIN, do not describe the website):
- SSL: ${diagnosis.has_ssl ? 'Yes' : 'No'}
- Online booking: ${diagnosis.has_booking_software ? 'Yes' : 'No'}
- Client portal: ${diagnosis.has_client_portal ? 'Yes' : 'No'}
- Intake forms: ${diagnosis.has_intake_forms ? 'Yes' : 'No'}
- Gaps: ${diagnosis.issues.join(', ') || 'none major'}

THE CASE STUDY TO USE (use THIS one exactly, do not invent others):
- Client descriptor: ${caseStudy.name}
- What we built: ${caseStudy.what}
- Result: ${caseStudy.result}

STRUCTURE — follow exactly in this order:

1. Greeting:
   ${hasRealName
     ? `Write exactly: "Hey ${firstName},"`
     : `DO NOT write any greeting. Open the email directly with the observation in step 2. NEVER write "Hey there", "Hey team", or "Hi" — these read as mass-sent.`}

2. ONE specific operational observation (18–25 words). Infer the BUSINESS PAIN, not the website symptom.
   GOOD: "If ${company} is still handling new-patient intake by phone, your front desk is probably spending 8–12 hours a week on it."
   BAD: "I noticed your site doesn't have online booking."

3. ONE sentence of proof using THE case study above (reference it naturally):
   "For ${caseStudy.name}, we ${caseStudy.what} — ${caseStudy.result}."
   Then ONE sentence connecting that result to ${company}'s likely situation.

4. The OFFER (the named deliverable, ~20–30 words):
   "I put together a 1-page map of the 3 highest-ROI automations for ${shortIndustry} like yours. Yours to keep, no call required."

5. The MICRO-CTA — write exactly this line, no paraphrasing:
   Reply 'send it' and I'll email it over today.

6. Sign-off (three lines exactly):
   Nathan
   Founder, MonkFlow
   monkflow.io

${includePs ? `7. P.S. with booking URL (exactly this line):
   P.S. Or if easier to just talk: ${bookingUrl}` : `7. DO NOT add a P.S. line. No booking URL is configured — omit the P.S. entirely.`}

HARD RULES:
- 95–120 words body total (excluding signature${includePs ? ' + P.S.' : ''}).
- NEVER use these phrases: "I noticed", "I came across", "reaching out", "touching base", "hope this finds you well", "I'd love to", "quick chat", "quick question", "just wanted to", "let me know if", "happy to chat", "thoughts?", "interested?", "circling back", "curious if this is on your radar".
- The CTA is exactly "Reply 'send it' and I'll email it over today." Do not paraphrase. Do not add a second question. Do not append anything.
- Plain prose only. NO bullet points. NO numbered lists.
- Sign off exactly as specified. No "Best,", no "Thanks,", no last name, no phone number.
- Do NOT invent case study names — only use "${caseStudy.name}".

SUBJECT LINE:
- 3–6 words, sentence case (capitalize first word only), no emoji, no all-lowercase.
- VARY your choice across the patterns below — do not always pick the same one.
  The first two options involve the prospect's name/company pain and are
  preferred; mix in the others so the 100-lead cohort doesn't ship with a
  single subject template (spam filters flag near-duplicate subject corpora).
- Preferred patterns, in order of preference:
  ${hasRealName ? `1. "${firstName}, a question about ${company}"
  2. "Saw something at ${company}"
  3. "${company} intake question"
  4. "3 automations for ${company}"` : `1. "A question about ${company}"
  2. "Saw something at ${company}"
  3. "${company} intake question"
  4. "3 automations for ${company}"`}
- AVOID overused patterns (all used >200× recently — will hit spam filters):
  "Quick question", "Re: Quick question", "Question about {company}", "{city} {industry} + intake".

Return JSON only: {"subject": "...", "body": "..."}`;

  // Track regenerations due to subject overuse (separate from API retry backoff).
  // Bumped 2 → 3 so that if the AI picks the same "3 automations for {company}"
  // shape on consecutive sends, the regenerate pass has more room to land on a
  // truly different pattern before we give up and send whatever came back.
  let dedupAttempts = 0;
  const MAX_DEDUP = 3;
  let extraInstruction = '';

  const MAX_RETRIES = 5;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Hard 60s timeout — prevents silent hangs that stall the whole cron run
      const response = await Promise.race([
        client.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 600,
          // Temperature 0.4: structurally consistent output with substantive variation.
          // The prompt is rigid (exact CTA string, fixed signature) so we want the AI
          // to vary the observation and pain wording, not the structure.
          temperature: 0.4,
          messages: [{ role: 'user', content: prompt + extraInstruction }],
        }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('Claude API timeout after 60s')), 60000)),
      ]);

      const text = response.content[0].text;
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        // Subject-line dedup: if the same template shape has been used 5+ times
        // in the last 30 days, force a regenerate with explicit guidance.
        // Hard cap at MAX_DEDUP=3: after that we accept whatever Claude returned
        // (logged loudly so the next regression is visible) — keeps the loop
        // bounded at MAX_RETRIES + MAX_DEDUP = 8 iterations max even pathological.
        if (parsed.subject && dedupAttempts < MAX_DEDUP && await subjectIsOverused(parsed.subject)) {
          console.warn(`[LEADGEN] Subject overused: "${parsed.subject}" — regenerating (${dedupAttempts + 1}/${MAX_DEDUP})`);
          dedupAttempts++;
          extraInstruction = `\n\nREJECTED: Subject "${parsed.subject}" is a template shape that has been used too many times recently. Generate a COMPLETELY different subject pattern. Do NOT use "Quick question", "Re:", "Question about", or "{city} {industry}" templates. Try an observation-style subject instead.`;
          // Don't count this against MAX_RETRIES — it's a content regenerate, not an API failure
          attempt--;
          continue;
        }

        if (dedupAttempts >= MAX_DEDUP) {
          console.warn(`[LEADGEN] Subject dedup exhausted (${MAX_DEDUP} attempts) — accepting "${parsed.subject}". Investigate if this fires repeatedly.`);
        }

        return { ...parsed, variant: variant || 'v4-named-deliverable' };
      }
      // No JSON parsed — return a minimal safe fallback rather than sending
      // a generic "Quick question about X" that will fail the dedup check next time.
      return {
        subject: `3 automations for ${company}`,
        body: text,
        variant: variant || 'v4-named-deliverable',
      };
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
  // Block role-based addresses — nobody monitors info@, contact@, etc.
  const { isRoleBasedEmail } = require('../utils/nameParser');
  if (isRoleBasedEmail(lead.email)) {
    console.log(`[LEADGEN] Skipping role-based email: ${lead.email}`);
    return { success: false, error: 'role-based email' };
  }

  const unsubUrl = `${UNSUBSCRIBE_BASE}/api/v1/leadgen/unsubscribe/${lead.unsubscribe_token}`;

  // Plain-text-style HTML — no branding, no tables, no gradient logos.
  // Looks like a real person typed this in Gmail, not a marketing tool.
  const htmlBody = `
    <div style="font-family: -apple-system, sans-serif; max-width: 600px; line-height: 1.6; color: #333;">
      ${lead.outreach_body.split('\n').map(line => {
        if (!line.trim()) return '<br>';
        const escaped = escapeHtml(line);
        const linked = escaped.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#333;text-decoration:underline;">$1</a>');
        return `<p style="margin: 0 0 12px;">${linked}</p>`;
      }).join('')}
    </div>
    <div style="margin-top: 20px; font-size: 11px; color: #999; line-height: 1.5;">
      ${env.companyAddress ? `<p style="margin: 0 0 6px;">${escapeHtml(env.companyName)}<br>${escapeHtml(env.companyAddress)}</p>` : ''}
      <p style="margin: 0;"><a href="${unsubUrl}" style="color: #999;">Unsubscribe</a></p>
    </div>
    <img src="${SENDING_DOMAIN_BASE}/api/v1/outreach/track/open/${lead.unsubscribe_token}" width="1" height="1" style="display:none" alt="" />
  `;

  // Format the from address: "Display Name <email>"
  const fromAddr = sender ? `${sender.name} <${sender.email}>` : undefined;

  try {
    const replyTo = process.env.LEADGEN_REPLY_TO || 'nathan@mail.getmonkflow.com';

    // Plain-text alternative (improves deliverability — HTML-only emails score higher on spam filters)
    const addressLine = env.companyAddress ? `\n\n${env.companyName}\n${env.companyAddress}` : '';
    const plainText = `${lead.outreach_body}${addressLine}\n\nUnsubscribe: ${unsubUrl}`;

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
         ON CONFLICT (contact_email) DO UPDATE SET
           ai_email_subject = COALESCE(EXCLUDED.ai_email_subject, outreach_leads.ai_email_subject),
           original_subject = COALESCE(EXCLUDED.original_subject, outreach_leads.original_subject),
           original_email_body = COALESCE(EXCLUDED.original_email_body, outreach_leads.original_email_body),
           original_message_id = COALESCE(EXCLUDED.original_message_id, outreach_leads.original_message_id),
           source_lead_id = COALESCE(EXCLUDED.source_lead_id, outreach_leads.source_lead_id),
           touch_count = outreach_leads.touch_count + 1,
           last_sent_at = NOW(),
           updated_at = NOW()`,
        [
          lead.contact_person || cleanCompanyName(lead.business_name, lead.email) || lead.business_name, // contact_name (prefer real person name, fall back to cleaned company name)
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
          lead.email_variant || 'v4-named-deliverable', // email_variant (v4 is the live cohort — old '1'/'2'/'3' remain on historical rows)
          leadScore >= 75,                        // priority (auto-flag high-scoring leads)
        ]
      );
    } catch (bridgeErr) {
      // Never break the pipeline for bridge failures — log and continue
      console.warn(`[LEADGEN] Bridge insert failed for ${lead.email}:`, bridgeErr.message);
    }

    // ── Mirror into outreach_emails so analytics dashboards see this send ──
    if (!lead.outreach_subject) {
      console.warn(`[LEADGEN] Skipping outreach_emails mirror for ${lead.email}: no subject`);
    } else {
      try {
        await dbQuery(
          `INSERT INTO outreach_emails (lead_id, touch_number, subject, body, gmail_message_id, variant, sent_at, delivered_at)
           SELECT id, 0, $2, $3, $4, $5, NOW(), NOW()
           FROM outreach_leads WHERE contact_email = $1
           LIMIT 1`,
          [lead.email, lead.outreach_subject, lead.outreach_body || '', emailId, lead.email_variant || 'v4-named-deliverable']
        );
      } catch (mirrorErr) {
        console.warn(`[LEADGEN] outreach_emails mirror failed for ${lead.email}:`, mirrorErr.message);
      }
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
  const stats = { searched: 0, discovered: 0, emailsGenerated: 0, emailed: 0, errors: 0, phaseHistory: [], bailedFromPhase: null };

  // ── Phase tracking (Tier B7+B10) ─────────────────────────
  // Lightweight per-phase elapsed-time tracking so failures show WHERE in
  // the pipeline they died, not just "55 min hit." Persists to
  // scheduler_heartbeats.last_phase (migration 046) on each phase start
  // so even a hard crash leaves a breadcrumb in the DB. Best-effort —
  // never break the pipeline for tracking.
  let currentPhase = null;
  let currentPhaseStart = 0;
  function startPhase(name) {
    if (currentPhase) {
      const elapsedMs = Date.now() - currentPhaseStart;
      stats.phaseHistory.push({ phase: currentPhase, ms: elapsedMs });
      console.log(`[LEADGEN] ◀ Phase ${currentPhase} done in ${Math.round(elapsedMs / 1000)}s`);
    }
    currentPhase = name;
    currentPhaseStart = Date.now();
    console.log(`[LEADGEN] ▶ Phase ${name} starting`);
    // Best-effort heartbeat update — never break pipeline for diagnostics
    dbQuery(
      `UPDATE scheduler_heartbeats SET last_phase = $1, last_phase_started_at = NOW() WHERE name = 'leadgen'`,
      [name]
    ).catch(() => { /* migration 046 not applied yet, or transient DB error */ });
  }
  function phaseElapsedMs() {
    return Date.now() - currentPhaseStart;
  }
  function bailIfPhaseOverBudget(budgetMs) {
    if (phaseElapsedMs() > budgetMs) {
      console.warn(`[LEADGEN] Phase ${currentPhase} budget exceeded (${Math.round(phaseElapsedMs() / 1000)}s > ${budgetMs / 1000}s) — bailing to next phase`);
      stats.bailedFromPhase = currentPhase;
      return true;
    }
    return false;
  }
  // Per-phase budgets in ms — sum to ~52 min, slightly under the 55-min
  // global cap in leadgen.scheduler.js. Tuned post-Tier-B5/B6 caps.
  const PHASE_BUDGETS = {
    resume: 5 * 60 * 1000,
    recovery: 8 * 60 * 1000,
    search: 8 * 60 * 1000,
    diagnosis: 12 * 60 * 1000,
    filter: 2 * 60 * 1000,
    generation: 12 * 60 * 1000,
    send: 5 * 60 * 1000,
  };

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
  startPhase('resume');
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

  startPhase('recovery');
  // 0b. Recover leads stuck in 'diagnosed' status (personalization never
  // completed on a previous run — e.g. Claude API hang, or daily slice
  // capacity got spent on nameless leads that got filtered out). Recovery
  // pulls from the full daily quota minus whatever resume already sent —
  // the backlog is paid-for work (search + diagnose already happened) and
  // should be drained before spending new search credits.
  try {
    const RECOVERY_CAP = Math.max(0, resumeWarming.daily - stats.emailed);
    if (RECOVERY_CAP > 0) {
      // Load a large candidate pool — nameless leads dominate the top of the
      // lead_score ordering (they have strong diagnosis signals but no person
      // to address). If we LIMIT to RECOVERY_CAP, the loop spends its budget
      // marking nameless leads skipped_no_name and never reaches named ones
      // deeper in the backlog. Pool of 500 is large enough that even in the
      // worst case we find RECOVERY_CAP named leads to actually send.
      const CANDIDATE_POOL = 500;
      const { rows: stuckLeads } = await dbQuery(
        `SELECT * FROM leads
         WHERE status = 'diagnosed'
           AND diagnosis_json IS NOT NULL
           AND (outreach_subject IS NULL OR outreach_body IS NULL)
         ORDER BY COALESCE(lead_score, 0) DESC, created_at
         LIMIT $1`,
        [CANDIDATE_POOL]
      );
      if (stuckLeads.length > 0) {
        console.log(`[LEADGEN] Recovery pool: ${stuckLeads.length} candidates, aiming for up to ${RECOVERY_CAP} sends`);
        await logExec('info', `Recovering stuck 'diagnosed' leads`, { pool: stuckLeads.length, target: RECOVERY_CAP });
        const recSenders = await getHealthySenders();
        const recCounts = new Map(recSenders.map(s => [s.email, 0]));
        let recIdx = 0;
        let recoveredSends = 0;
        // Single-variant cohort for A/B measurement vs. historical '1'/'2'/'3'.
        // New named-deliverable framework — see plan phase 4.
        const REC_VARIANTS = ['v4-named-deliverable'];
        let recVariantCursor = 0;
        for (const lead of stuckLeads) {
          // Stop once we've drained up to today's remaining capacity.
          if (recoveredSends >= RECOVERY_CAP) break;
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
            recoveredSends++;
            recCounts.set(sender.email, recCounts.get(sender.email) + 1);
            trackSend(sender.email);
          } else {
            stats.errors++;
          }
          await sleep(1000);
        }
        console.log(`[LEADGEN] Recovery complete: ${recoveredSends} recovered sends, ${stats.emailed} total sent so far`);
      }
    }
  } catch (recErr) {
    console.error('[LEADGEN] Diagnosed recovery error:', recErr.message);
    await logExec('error', `Diagnosed recovery failed: ${recErr.message}`, { error: recErr.message });
  }

  // Skip fresh searches if recovery + resume already filled the daily quota.
  // No sense burning SearchAPI credits + Claude tokens to find leads we can't
  // send anyway, and the backlog (917+ stuck 'diagnosed' leads) has plenty of
  // inventory already.
  if (stats.emailed >= resumeWarming.daily) {
    console.log(`[LEADGEN] Daily quota (${resumeWarming.daily}) filled from resume+recovery — skipping fresh searches`);
    await logExec('info', `Quota filled by resume+recovery, skipping search phase`, { emailed: stats.emailed, daily: resumeWarming.daily });
    // Jump straight to the summary — no new discovery, no new send phase
    try {
      await sendOwnerSummary(batchDate, stats, []);
    } catch (err) {
      console.error('[LEADGEN] Failed to send owner summary:', err.message);
    }
    pushover.sendDailySummary({
      scheduler: 'LeadGen (Email)',
      lines: [
        `Searched: 0 (quota filled from backlog)`,
        `Emailed: ${stats.emailed}`,
        stats.errors ? `⚠️ Errors: ${stats.errors}` : null,
      ],
      url: `${env.frontendUrl}/admin`,
    }).catch(() => {});
    console.log(`[LEADGEN] === Complete (backlog-only): ${JSON.stringify(stats)} ===`);
    await logExec('info', `Pipeline complete (backlog-only)`, stats);
    try {
      if (executionId) {
        await dbQuery(
          `UPDATE workflow_executions SET status = $1, result = $2, completed_at = $3, duration_ms = $4 WHERE id = $5`,
          ['completed', JSON.stringify(stats), new Date(), Date.now() - pipelineStartTime, executionId]
        );
      }
    } catch (_) {}
    return stats;
  }

  startPhase('search');
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
  //
  // PARALLELIZED 2026-04-29: was sequential (firmTypes × cities = ~220
  // queries with 1.5s sleep between every call = ~60 min worst case).
  // Now flatten to a single list and process 3 concurrent SerpAPI calls
  // per batch with 1.5s between batches → ~110s worst case.
  const SEARCH_CONCURRENCY = 3;
  const SEARCH_BATCH_SLEEP_MS = 1500;
  const DIRECTORY_BLOCKLIST = /yelp|yellowpages|bbb\.org|findlaw|avvo|justia|facebook\.com|linkedin|mapquest|manta\.com|chamberofcommerce/i;
  const queryList = firmTypes.flatMap(firmType => {
    const query = shuffle(firmType.queries)[0];
    return cities.map(city => ({ firmType: firmType.type, city, searchQuery: `${query} ${city} email` }));
  });
  const rawLeads = [];
  let serpApiAborted = false;

  async function runOneSearch({ firmType, city, searchQuery }) {
    try {
      const results = await searchSerpAPI(searchQuery);
      stats.searched += results.length;
      const filtered = [];
      for (const r of results) {
        if (DIRECTORY_BLOCKLIST.test(r.link)) continue;
        const snippetEmails = extractEmails(r.snippet || '');
        filtered.push({ ...r, snippetEmails, city, searchQuery, firmType });
      }
      return { added: filtered };
    } catch (err) {
      if (err.message.startsWith('SEARCHAPI_AUTH_FAILURE')) {
        return { authFailure: true, error: err.message };
      }
      return { error: err.message, searchQuery };
    }
  }

  for (let i = 0; i < queryList.length; i += SEARCH_CONCURRENCY) {
    if (serpApiAborted) break;
    if (bailIfPhaseOverBudget(PHASE_BUDGETS.search)) break;
    const batch = queryList.slice(i, i + SEARCH_CONCURRENCY);
    const results = await Promise.allSettled(batch.map(runOneSearch));
    for (const r of results) {
      if (r.status === 'rejected') {
        stats.errors++;
        console.error('[LEADGEN] Search batch entry rejected:', r.reason?.message || r.reason);
        continue;
      }
      const v = r.value;
      if (v.authFailure) {
        console.error('[LEADGEN] ❌ SearchAPI authentication failed — aborting all searches. Check your SEARCHAPI_KEY.');
        await logExec('error', 'SearchAPI authentication failed — aborting searches', { error: v.error });
        stats.errors++;
        serpApiAborted = true;
        break;
      }
      if (v.error) {
        console.error(`[LEADGEN] Search error for "${v.searchQuery}":`, v.error);
        await logExec('error', `Search error: ${v.error}`, { searchQuery: v.searchQuery, error: v.error });
        stats.errors++;
        continue;
      }
      if (v.added) rawLeads.push(...v.added);
    }
    if (i + SEARCH_CONCURRENCY < queryList.length && !serpApiAborted) {
      await sleep(SEARCH_BATCH_SLEEP_MS);
    }
  }

  console.log(`[LEADGEN] Raw search results: ${rawLeads.length}`);
  await logExec('info', `Search phase complete`, { rawResultCount: rawLeads.length, searched: stats.searched });

  startPhase('diagnosis');
  // 3. Diagnose each website, extract emails, dedup
  //
  // PARALLELIZED 2026-04-29: was 500 sequential crawls × ~20s each = 175 min
  // worst case, the single biggest contributor to the 45-min cron timeout.
  // Now caps at 80 candidates and processes 5 concurrent diagnoses with 2s
  // sleep between batches → ~5.5 min worst case. The 80-cap is intentional:
  // current pipeline can only USE ~30/day at warm-1 (15) plus
  // resume/recovery backlog, so 80 high-quality candidates is plenty to
  // refill the funnel without blowing the budget.
  const ROLE_PREFIXES = /^(info|support|contact|admin|office|sales|help|billing|legal|hr|marketing|hello|general|team|directory|reception|inquiries|enquiries|careers|jobs|media|press|service|feedback|accounts|mail|staff)@/i;
  const DIAGNOSE_CAP = 80;
  const DIAGNOSE_CONCURRENCY = 5;
  const candidates = rawLeads.slice(0, DIAGNOSE_CAP);
  const qualifiedLeads = [];

  async function diagnoseAndPersistOne(raw) {
    try {
      const websiteUrl = raw.link;
      let diagnosis;
      try {
        diagnosis = await diagnoseWebsite(websiteUrl);
      } catch (_diagErr) {
        // Website unreachable — still use snippet emails if available
        diagnosis = {
          has_ssl: websiteUrl.startsWith('https'),
          has_booking_software: false, booking_software_name: null,
          has_client_portal: false, has_intake_forms: false,
          design_age_estimate: 'unknown', emails: [], issues: ['Website unreachable'],
        };
      }

      if (raw.snippetEmails && raw.snippetEmails.length > 0) {
        diagnosis.emails = [...new Set([...diagnosis.emails, ...raw.snippetEmails])];
      }

      const sortedEmails = [...diagnosis.emails].sort((a, b) => {
        const aIsRole = ROLE_PREFIXES.test(a);
        const bIsRole = ROLE_PREFIXES.test(b);
        if (aIsRole && !bIsRole) return 1;
        if (!aIsRole && bIsRole) return -1;
        return 0;
      });
      const bestEmail = sortedEmails[0];
      if (!bestEmail) return { skipped: 'no-email' };
      if (ROLE_PREFIXES.test(bestEmail)) return { skipped: 'role-only' };

      const { verifyEmail } = require('./outreach-ai.service');
      const verification = await verifyEmail(bestEmail);
      if (!verification.valid) return { skipped: `invalid-${verification.reason}` };
      const cleanEmail = verification.normalizedEmail || bestEmail;

      if (await leadModel.emailExists(cleanEmail)) return { skipped: 'duplicate' };

      const [cityName, stateCode] = raw.city.split(/\s+(?=[A-Z]{2}$)/);
      const businessName = raw.title.replace(/\s*[\|–—].*$/, '').trim();
      const personName = diagnosis._rawHtml
        ? extractPersonName(diagnosis._rawHtml, diagnosis._pageTitle || raw.title)
        : null;
      delete diagnosis._rawHtml;
      delete diagnosis._pageTitle;

      const lead = {
        business_name: businessName,
        contact_person: personName,
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
      return inserted ? { discovered: inserted } : { skipped: 'insert-failed' };
    } catch (err) {
      return { error: err.message, link: raw.link };
    }
  }

  console.log(`[LEADGEN] Diagnosis phase: ${candidates.length} candidates, batches of ${DIAGNOSE_CONCURRENCY}`);
  for (let i = 0; i < candidates.length; i += DIAGNOSE_CONCURRENCY) {
    const batch = candidates.slice(i, i + DIAGNOSE_CONCURRENCY);
    const results = await Promise.allSettled(batch.map(diagnoseAndPersistOne));
    for (const r of results) {
      if (r.status === 'rejected') {
        stats.errors++;
        console.error('[LEADGEN] Diagnosis batch entry rejected:', r.reason?.message || r.reason);
        continue;
      }
      const v = r.value;
      if (v.discovered) {
        qualifiedLeads.push(v.discovered);
        stats.discovered++;
      } else if (v.error) {
        stats.errors++;
        console.error(`[LEADGEN] Error processing ${v.link || ''}:`, v.error);
      }
      // skipped values are silent — counted implicitly by `candidates.length - qualifiedLeads.length - errors`
    }
    const batchNo = Math.floor(i / DIAGNOSE_CONCURRENCY) + 1;
    const batchTotal = Math.ceil(candidates.length / DIAGNOSE_CONCURRENCY);
    console.log(`[LEADGEN] Diagnosis batch ${batchNo}/${batchTotal} done — ${qualifiedLeads.length} qualified, ${stats.errors} errors`);
    if (batchNo % 4 === 0) {
      await logExec('info', `Diagnosis progress: ${batchNo}/${batchTotal} batches`, {
        processed: Math.min((batchNo) * DIAGNOSE_CONCURRENCY, candidates.length),
        total: candidates.length,
        discovered: qualifiedLeads.length,
        errors: stats.errors,
      });
    }
    if (bailIfPhaseOverBudget(PHASE_BUDGETS.diagnosis)) break;
    if (i + DIAGNOSE_CONCURRENCY < candidates.length) {
      await sleep(2000); // polite crawling: 2s between concurrent batches
    }
  }

  console.log(`[LEADGEN] Qualified leads: ${qualifiedLeads.length}`);

  startPhase('filter');
  // 4. Sort by score (most gaps first), take top leads (warming-aware limit)
  const warming = getWarmingLimits();
  console.log(`[LEADGEN] Domain warming phase: ${warming.phase} — daily limit: ${warming.daily}, per-sender: ${warming.perSender}`);
  qualifiedLeads.sort((a, b) => scoreLead(b.diagnosis_json) - scoreLead(a.diagnosis_json));

  // Filter out leads where we can't find a real first name BEFORE slicing to
  // the daily cap. Sending "Hey there" tanks reply rate — previous data showed
  // 25% of sends going to "Hey there" with 0 replies. Filtering before the
  // slice ensures we always fill the daily quota with sendable leads instead
  // of wasting capacity on nameless candidates that block named ones ranked
  // below them.
  const skippedNoName = [];
  const skippedNoCompany = [];
  const withName = [];
  const { looksLikePageTitle: _looksLikePageTitle } = require('../utils/nameParser');
  for (const lead of qualifiedLeads) {
    const fn = getFirstName(lead.contact_person, lead.email);
    if (!fn || fn === 'there') {
      skippedNoName.push(lead);
      continue;
    }
    // Skip leads where we can't produce a non-garbage company name for the
    // AI prompt. cleanCompanyName now falls back to the email domain, so this
    // only fails when the domain is public (gmail/yahoo/etc.) AND the
    // business_name is a page title like "Meet Our Team" — unsalvageable.
    const cc = cleanCompanyName(lead.business_name, lead.email);
    if (!cc || cc.length < 3 || _looksLikePageTitle(cc)) {
      skippedNoCompany.push(lead);
      continue;
    }
    withName.push(lead);
  }
  if (skippedNoName.length > 0) {
    console.log(`[LEADGEN] Skipping ${skippedNoName.length}/${qualifiedLeads.length} leads with no identifiable first name (would send "Hey there")`);
    await logExec('info', `Skipped ${skippedNoName.length} nameless leads`, { count: skippedNoName.length, total: qualifiedLeads.length });
    try {
      const ids = skippedNoName.map(l => l.id);
      if (ids.length > 0) {
        await dbQuery(`UPDATE leads SET status = 'skipped_no_name' WHERE id = ANY($1::uuid[])`, [ids]);
      }
    } catch (_) {}
  }
  if (skippedNoCompany.length > 0) {
    console.log(`[LEADGEN] Skipping ${skippedNoCompany.length}/${qualifiedLeads.length} leads with page-title-only business names (would pollute subject/body)`);
    await logExec('info', `Skipped ${skippedNoCompany.length} no-company leads`, { count: skippedNoCompany.length });
    try {
      const ids = skippedNoCompany.map(l => l.id);
      if (ids.length > 0) {
        await dbQuery(`UPDATE leads SET status = 'skipped_bad_company' WHERE id = ANY($1::uuid[])`, [ids]);
      }
    } catch (_) {}
  }
  // Slice the NAMED leads to the per-run generation cap.
  //
  // PER_RUN_GEN_CAP is decoupled from warming.daily so a single cron tick
  // never blows the runtime budget. At full phase warming.daily=90; this cap
  // says "still generate at most 30 per tick — the remaining 60 queue up on
  // status='diagnosed' and get picked up by the next hourly outreach cron
  // OR by tomorrow's leadgen run via the resume-unsent-leads phase." Keeps
  // each leadgen run under the per-phase timeout in Tier B7.
  const PER_RUN_GEN_CAP = 30;
  const GEN_CONCURRENCY = 3;
  const PER_LEAD_GEN_TIMEOUT_MS = 90 * 1000;
  const toEmail = withName.slice(0, Math.min(warming.daily, PER_RUN_GEN_CAP));

  startPhase('generation');
  // 5. Generate personalized outreach via Claude API
  //
  // Pre-assign variants synchronously so parallel batches don't race on
  // a shared cursor. Currently a single-variant cohort (v4) so the
  // assignment is trivial, but stays robust if/when we A/B test again.
  const TEST_VARIANTS = ['v4-named-deliverable'];
  toEmail.forEach((lead, i) => {
    lead.email_variant = TEST_VARIANTS[i % TEST_VARIANTS.length];
  });

  await logExec('info', `Email generation starting for ${toEmail.length} leads`, { leadCount: toEmail.length });

  async function generateOne(lead) {
    try {
      const { subject, body } = await Promise.race([
        generateOutreachEmail(lead, lead.diagnosis_json, (attempt, maxRetries, errMsg) => {
          logExec('warn', `Claude API retry attempt ${attempt}/${maxRetries}: ${errMsg}`, { attempt, maxRetries, email: lead.email, error: errMsg });
        }, lead.email_variant),
        new Promise((_, rej) => setTimeout(() => rej(new Error(`per-lead generation timeout ${PER_LEAD_GEN_TIMEOUT_MS}ms`)), PER_LEAD_GEN_TIMEOUT_MS)),
      ]);
      await leadModel.update(lead.id, { outreach_subject: subject, outreach_body: body, status: 'email_generated', email_variant: lead.email_variant });
      lead.outreach_subject = subject;
      lead.outreach_body = body;
      return { ok: true };
    } catch (err) {
      return { error: err.message, email: lead.email };
    }
  }

  for (let i = 0; i < toEmail.length; i += GEN_CONCURRENCY) {
    const batch = toEmail.slice(i, i + GEN_CONCURRENCY);
    const results = await Promise.allSettled(batch.map(generateOne));
    for (const r of results) {
      if (r.status === 'rejected') {
        stats.errors++;
        console.error('[LEADGEN] Generation batch entry rejected:', r.reason?.message || r.reason);
        continue;
      }
      const v = r.value;
      if (v.ok) {
        stats.emailsGenerated++;
      } else {
        stats.errors++;
        console.error(`[LEADGEN] Email generation error for ${v.email}:`, v.error);
        await logExec('error', `Email generation failed for ${v.email}: ${v.error}`, { email: v.email, error: v.error });
      }
    }
    if (bailIfPhaseOverBudget(PHASE_BUDGETS.generation)) break;
    if (i + GEN_CONCURRENCY < toEmail.length) await sleep(500);
  }

  startPhase('send');
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

  startPhase('summary');
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

  // Capture the final phase's elapsed time before printing the summary
  if (currentPhase) {
    stats.phaseHistory.push({ phase: currentPhase, ms: phaseElapsedMs() });
    console.log(`[LEADGEN] ◀ Phase ${currentPhase} done in ${Math.round(phaseElapsedMs() / 1000)}s`);
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

module.exports = { runDailyLeadGeneration, diagnoseWebsite, generateOutreachEmail, searchSerpAPI, trackSend, trackBounce, trackComplaint, getHealthySenders, getWarmingLimits, scoreLead, escapeHtml, FIRM_TYPES, US_CITIES };
