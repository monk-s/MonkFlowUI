const env = require('../config/env');
const leadModel = require('../models/leadgen.model');
const { sendEmail } = require('./email.service');
const https = require('https');
const http = require('http');
const { URL } = require('url');

// ── Config ──────────────────────────────────────────
const SERPAPI_KEY = process.env.SERPAPI_KEY || '';
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

function fetchUrl(url, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;
    const req = lib.get(url, { timeout, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MonkFlowBot/1.0)' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location, timeout).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, html: data, url: res.responseUrl || url }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function extractEmails(html) {
  const matches = html.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g) || [];
  const filtered = [...new Set(matches)].filter(e => {
    const lower = e.toLowerCase();
    return !lower.endsWith('.png') && !lower.endsWith('.jpg') && !lower.endsWith('.gif')
      && !lower.includes('example.com') && !lower.includes('sentry.io')
      && !lower.includes('wixpress.com') && !lower.includes('wordpress.org');
  });
  return filtered;
}

// ── SerpAPI Search ──────────────────────────────────

async function searchSerpAPI(queryStr) {
  if (!SERPAPI_KEY) {
    console.warn('[LEADGEN] No SERPAPI_KEY set, skipping search');
    return [];
  }

  const params = new URLSearchParams({
    q: queryStr,
    api_key: SERPAPI_KEY,
    engine: 'google',
    num: '15',
    gl: 'us',
    hl: 'en',
  });

  try {
    const resp = await fetchUrl(`https://serpapi.com/search.json?${params}`, 15000);
    const data = JSON.parse(resp.html);
    const results = (data.organic_results || []).map(r => ({
      title: r.title || '',
      link: r.link || '',
      snippet: r.snippet || '',
    }));
    return results;
  } catch (err) {
    console.error('[LEADGEN] SerpAPI error:', err.message);
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
    const mainPage = await fetchUrl(url.startsWith('http') ? url : `https://${url}`);
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
        const contactPage = await fetchUrl(contactUrl);
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
      ${lead.outreach_body.split('\n').map(line => line.trim() ? `<p style="margin: 0 0 12px;">${line}</p>` : '<br>').join('')}
    </div>
    <div style="margin-top: 30px; padding-top: 15px; border-top: 1px solid #eee; font-size: 11px; color: #999;">
      <p>MonkFlow LLC | Abilene, TX</p>
      <p><a href="${unsubUrl}" style="color: #999;">Unsubscribe</a></p>
    </div>
  `;

  // Format the from address: "Display Name <email>"
  const fromAddr = sender ? `${sender.name} <${sender.email}>` : undefined;

  try {
    const ownerBcc = process.env.OWNER_NOTIFICATION_EMAIL || 'nathan@monkflow.io';
    const result = await sendEmail({
      to: lead.email,
      subject: lead.outreach_subject,
      html: htmlBody,
      from: fromAddr,
      bcc: ownerBcc,
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
  const stats = { searched: 0, discovered: 0, diagnosed: 0, emailed: 0, errors: 0 };

  // 1. Pick random cities and firm types — use more cities & all firm types to hit 250+ leads
  const cities = shuffle(US_CITIES).slice(0, 15);
  const firmTypes = shuffle(FIRM_TYPES);
  const queryTemplate = shuffle(firmTypes[0].queries)[0];

  console.log(`[LEADGEN] Targeting: ${firmTypes.map(f => f.type).join(', ')} | Cities: ${cities.length}`);

  // 2. Search for leads — cycle through firm types and cities
  const rawLeads = [];
  for (const firmType of firmTypes) {
    const query = shuffle(firmType.queries)[0];
    for (const city of cities) {
      const searchQuery = `${query} ${city} email`;
      const results = await searchSerpAPI(searchQuery);
      stats.searched += results.length;

      for (const r of results) {
        // Skip directories, yelp, facebook itself, etc.
        if (/yelp|yellowpages|bbb\.org|findlaw|avvo|justia|facebook\.com|linkedin/i.test(r.link)) continue;
        rawLeads.push({ ...r, city, searchQuery, firmType: firmType.type });
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
      const diagnosis = await diagnoseWebsite(websiteUrl);

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
        priority: scoreLead(diagnosis) >= 7 ? 'HIGH' : scoreLead(diagnosis) >= 4 ? 'MEDIUM' : 'LOW',
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
    await sleep(2000); // polite crawling
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
      stats.diagnosed++;
    } catch (err) {
      console.error(`[LEADGEN] Email generation error for ${lead.email}:`, err.message);
      stats.errors++;
    }
    await sleep(500);
  }

  // 6. Send emails — distribute round-robin across senders (max PER_SENDER_LIMIT each)
  const senderCounts = new Map(SENDERS.map(s => [s.email, 0]));
  const readyLeads = toEmail.filter(l => l.outreach_subject && l.outreach_body);

  for (let i = 0; i < readyLeads.length; i++) {
    const sender = SENDERS[i % SENDERS.length];
    if (senderCounts.get(sender.email) >= PER_SENDER_LIMIT) continue; // skip if sender maxed out

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
  await sendOwnerSummary(batchDate, stats, toEmail);

  console.log(`[LEADGEN] === Complete: ${JSON.stringify(stats)} ===`);
  return stats;
}

async function sendOwnerSummary(batchDate, stats, leads) {
  const ownerEmail = process.env.OWNER_NOTIFICATION_EMAIL || 'nathan@monkflow.io';

  const leadsTable = leads.map(l =>
    `<tr><td>${l.business_name}</td><td>${l.city}, ${l.state}</td><td>${l.email}</td><td>${l.priority}</td></tr>`
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
      </div>
    `,
  });
}

module.exports = { runDailyLeadGeneration, diagnoseWebsite, generateOutreachEmail, searchSerpAPI };
