const env = require('../config/env');
const leadModel = require('../models/leadgen.model');
const { sendEmail } = require('./email.service');
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
const DAILY_LIMIT = parseInt(process.env.LEADGEN_DAILY_LIMIT, 10) || 250;
const PER_SENDER_LIMIT = parseInt(process.env.LEADGEN_PER_SENDER_LIMIT, 10) || 25;
const UNSUBSCRIBE_BASE = (env.frontendUrl || 'https://monkflow.io').replace(/\/$/, '');

// Rotate across 10 sender identities to protect deliverability
const SENDERS = [
  { email: 'nathan@monkflow.io', name: 'Nathan Linder' },
  { email: 'nate@monkflow.io', name: 'Nate Linder' },
  { email: 'nathan.linder@monkflow.io', name: 'Nathan Linder' },
  { email: 'n.linder@monkflow.io', name: 'Nathan L.' },
  { email: 'outreach@monkflow.io', name: 'Nathan at MonkFlow' },
  { email: 'hello@monkflow.io', name: 'Nathan from MonkFlow' },
  { email: 'growth@monkflow.io', name: 'Nathan — MonkFlow' },
  { email: 'team@monkflow.io', name: 'Nathan at MonkFlow' },
  { email: 'connect@monkflow.io', name: 'Nathan Linder' },
  { email: 'info@monkflow.io', name: 'Nathan at MonkFlow' },
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

async function generateOutreachEmail(lead, diagnosis) {
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: env.anthropicApiKey });

  const prompt = `You are writing a cold outreach email for Nathan Linder, who runs MonkFlow (monkflow.io), a web development and automation company for small businesses.

Write a SHORT cold email (under 150 words) to this business. Be specific about what you found on their website. Do NOT be salesy. Be helpful and direct. Write from the perspective of Nathan Linder.

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

FORMAT:
- Start with "Hi [first name or 'there'],"
- Reference ONE specific finding from their site
- Explain what MonkFlow could add (1-2 sentences)
- End with a soft CTA asking for a 15-min call
- Sign off as: Nathan Linder / MonkFlow | monkflow.io
- Subject line should be short and curiosity-driven (under 50 chars)

Return JSON: {"subject": "...", "body": "..."}`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return { subject: `Quick question about ${lead.business_name}`, body: text };
  } catch (err) {
    console.error('[LEADGEN] Claude API error:', err.message);
    return {
      subject: `Quick question about ${lead.business_name}`,
      body: `Hi there,\n\nI'm Nathan — I build software for small businesses. I came across ${lead.website_url || 'your business'} and noticed some opportunities to improve your digital presence. MonkFlow helps firms like yours add scheduling, client portals, and intake forms.\n\n15 min call?\n\nNathan Linder\nMonkFlow | monkflow.io`,
    };
  }
}

// ── Score a lead (higher = more gaps = better prospect) ──

function scoreLead(diagnosis) {
  let score = 0;
  if (!diagnosis.has_ssl) score += 3;
  if (!diagnosis.has_booking_software) score += 2;
  if (!diagnosis.has_client_portal) score += 2;
  if (!diagnosis.has_intake_forms) score += 2;
  if (diagnosis.design_age_estimate === 'outdated') score += 2;
  if (diagnosis.design_age_estimate === 'unknown') score += 1;
  if (!diagnosis.has_ssl && !diagnosis.has_booking_software && !diagnosis.has_client_portal) score += 3; // total layup
  return score;
}

// ── Send Cold Email ─────────────────────────────────

async function sendColdEmail(lead, sender) {
  const unsubUrl = `${UNSUBSCRIBE_BASE}/api/v1/leadgen/unsubscribe/${lead.unsubscribe_token}`;

  const htmlBody = `
    <div style="font-family: -apple-system, sans-serif; max-width: 600px; line-height: 1.6; color: #333;">
      ${lead.outreach_body.split('\n').map(line => line.trim() ? `<p style="margin: 0 0 12px;">${escapeHtml(line)}</p>` : '<br>').join('')}
    </div>
    <div style="margin-top: 30px; padding-top: 15px; border-top: 1px solid #eee; font-size: 11px; color: #999;">
      <p>MonkFlow LLC | 1600 Sayles Blvd, Abilene, TX 79605</p>
      <p><a href="${unsubUrl}" style="color: #999;">Unsubscribe</a></p>
    </div>
  `;

  // Format the from address: "Display Name <email>"
  const fromAddr = sender ? `${sender.name} <${sender.email}>` : undefined;

  try {
    const replyTo = process.env.LEADGEN_REPLY_TO || 'nathan@monkflow.io';
    const result = await sendEmail({
      to: lead.email,
      subject: lead.outreach_subject,
      html: htmlBody,
      from: fromAddr,
      reply_to: replyTo,
      headers: {
        'Reply-To': replyTo,
        'List-Unsubscribe': `<${unsubUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    });

    const emailId = result?.data?.id || result?.id || null;
    await leadModel.update(lead.id, { status: 'sent', sent_at: new Date(), resend_email_id: emailId });
    return { success: true, emailId };
  } catch (err) {
    console.error(`[LEADGEN] Failed to send to ${lead.email}:`, err.message);
    return { success: false, error: err.message };
  }
}

// ── Main Orchestrator ───────────────────────────────

async function runDailyLeadGeneration() {
  console.log('[LEADGEN] === Starting daily lead generation ===');
  const batchDate = new Date().toISOString().split('T')[0];
  const stats = { searched: 0, discovered: 0, emailsGenerated: 0, emailed: 0, errors: 0 };

  // 0. Resume any unsent leads from previous interrupted runs
  try {
    const { query: dbQuery } = require('../config/database');
    const { rows: unsentLeads } = await dbQuery(
      `SELECT * FROM leads WHERE status = 'email_generated' AND outreach_subject IS NOT NULL AND outreach_body IS NOT NULL ORDER BY created_at LIMIT 250`
    );
    if (unsentLeads.length > 0) {
      console.log(`[LEADGEN] Found ${unsentLeads.length} unsent leads from previous run — sending now`);
      const senderCounts = new Map(SENDERS.map(s => [s.email, 0]));
      let senderIdx = 0;
      for (const lead of unsentLeads) {
        let sender = null;
        for (let j = 0; j < SENDERS.length; j++) {
          const candidate = SENDERS[(senderIdx + j) % SENDERS.length];
          if (senderCounts.get(candidate.email) < PER_SENDER_LIMIT) {
            sender = candidate;
            senderIdx = (senderIdx + j + 1) % SENDERS.length;
            break;
          }
        }
        if (!sender) break;
        const result = await sendColdEmail(lead, sender);
        if (result.success) {
          stats.emailed++;
          senderCounts.set(sender.email, senderCounts.get(sender.email) + 1);
        } else {
          stats.errors++;
        }
        await sleep(1000);
      }
      console.log(`[LEADGEN] Resumed sending complete: ${stats.emailed} sent, ${stats.errors} errors`);
    }
  } catch (resumeErr) {
    console.error('[LEADGEN] Resume unsent error:', resumeErr.message);
  }

  // 1. Pick firm types and cities — budget ~220 searches/day to stay under 5k/month
  // 10 firm types × 22 cities = 220 searches/day × 22 weekdays = 4,840/month
  const cities = shuffle(US_CITIES).slice(0, 22);
  const firmTypes = shuffle(FIRM_TYPES);

  console.log(`[LEADGEN] Targeting: ${firmTypes.map(f => f.type).join(', ')} | Cities: ${cities.length}`);

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
          stats.errors++;
          serpApiAborted = true;
          break;
        }
        console.error(`[LEADGEN] Search error for "${searchQuery}":`, err.message);
        stats.errors++;
      }
      await sleep(1500); // rate limit
    }
  }

  console.log(`[LEADGEN] Raw search results: ${rawLeads.length}`);

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

      // Check dedup
      if (await leadModel.emailExists(bestEmail)) continue;

      // Parse city/state
      const [cityName, stateCode] = raw.city.split(/\s+(?=[A-Z]{2}$)/);

      const lead = {
        business_name: raw.title.replace(/\s*[\|–—].*$/, '').trim(),
        business_type: raw.firmType,
        city: cityName,
        state: stateCode,
        website_url: websiteUrl,
        facebook_url: null,
        email: bestEmail,
        phone: null,
        ...diagnosis,
        diagnosis_json: diagnosis,
        status: 'diagnosed',
        priority: (() => { const s = scoreLead(diagnosis); return s >= 7 ? 'HIGH' : s >= 4 ? 'MEDIUM' : 'LOW'; })(),
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
    }

    // Progress log every 50 sites
    const idx = rawLeads.indexOf(raw);
    if (idx > 0 && idx % 50 === 0) {
      console.log(`[LEADGEN] Progress: ${idx}/${Math.min(rawLeads.length, 500)} processed, ${qualifiedLeads.length} discovered, ${stats.errors} errors`);
    }

    await sleep(1000); // polite crawling
  }

  console.log(`[LEADGEN] Qualified leads: ${qualifiedLeads.length}`);

  // 4. Sort by score (most gaps first), take top DAILY_LIMIT
  qualifiedLeads.sort((a, b) => scoreLead(b.diagnosis_json) - scoreLead(a.diagnosis_json));
  const toEmail = qualifiedLeads.slice(0, DAILY_LIMIT);

  // 5. Generate personalized outreach via Claude API
  for (const lead of toEmail) {
    try {
      const { subject, body } = await generateOutreachEmail(lead, lead.diagnosis_json);
      await leadModel.update(lead.id, { outreach_subject: subject, outreach_body: body, status: 'email_generated' });
      lead.outreach_subject = subject;
      lead.outreach_body = body;
      stats.emailsGenerated++;
    } catch (err) {
      console.error(`[LEADGEN] Email generation error for ${lead.email}:`, err.message);
      stats.errors++;
    }
    await sleep(500);
  }

  // 6. Send emails — distribute round-robin across senders (max PER_SENDER_LIMIT each)
  const senderCounts = new Map(SENDERS.map(s => [s.email, 0]));
  const readyLeads = toEmail.filter(l => l.outreach_subject && l.outreach_body);
  let senderIdx = 0;

  for (let i = 0; i < readyLeads.length; i++) {
    // Find next available sender (one that hasn't hit the per-sender limit)
    let sender = null;
    for (let j = 0; j < SENDERS.length; j++) {
      const candidate = SENDERS[(senderIdx + j) % SENDERS.length];
      if (senderCounts.get(candidate.email) < PER_SENDER_LIMIT) {
        sender = candidate;
        senderIdx = (senderIdx + j + 1) % SENDERS.length;
        break;
      }
    }
    if (!sender) { console.log('[LEADGEN] All senders maxed out, stopping.'); break; }

    const result = await sendColdEmail(readyLeads[i], sender);
    if (result.success) {
      stats.emailed++;
      senderCounts.set(sender.email, senderCounts.get(sender.email) + 1);
    } else {
      stats.errors++;
    }
    await sleep(1000); // stagger sends
  }

  console.log(`[LEADGEN] Sender distribution: ${[...senderCounts.entries()].map(([e,c]) => `${e}=${c}`).join(', ')}`);

  // 7. Send summary to owner
  try {
    await sendOwnerSummary(batchDate, stats, toEmail);
  } catch (err) {
    console.error('[LEADGEN] Failed to send owner summary:', err.message);
  }

  console.log(`[LEADGEN] === Complete: ${JSON.stringify(stats)} ===`);
  return stats;
}

async function sendOwnerSummary(batchDate, stats, leads) {
  const ownerEmail = process.env.OWNER_NOTIFICATION_EMAIL || 'nathan@monkflow.io';

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

module.exports = { runDailyLeadGeneration, diagnoseWebsite, generateOutreachEmail, searchSerpAPI };
