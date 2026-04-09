// LinkedIn outreach pipeline — mirrors the cold-email pipeline but uses
// Unipile to drive a real LinkedIn account. See plan in
// /Users/nathanlinder/.claude/plans/delightful-knitting-donut.md
//
// Daily flow:
//   1. discoverProspects()  — find ICP businesses, look up owners on LI
//   2. enrichProfiles()     — pull about/title/recent activity
//   3. score + filter
//   4. personalize          — Claude generates connect note + first DM
//   5. sendConnects()       — up to LINKEDIN_DAILY_CONNECT_LIMIT
//   6. sendDMs()            — to leads that have ACCEPTED (status=connected)
//   7. owner summary email
//
// Phone alerts on accepts/replies are fired by the webhook handler in
// linkedin.controller.js → pushover.client.js (same flow as cold-email).

const { query } = require('../config/database');
const env = require('../config/env');
const logger = require('../utils/logger');
const unipile = require('./unipile.client');
const { sendEmail } = require('./email.service');
const leadgen = require('./leadgen.service');
const pushover = require('./pushover.client');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const OWNER_TITLE_KEYWORDS = ['owner', 'founder', 'partner', 'president', 'CEO', 'managing director', 'principal'];

// Boolean-search industry keywords per firm.type (mirrors leadgen.FIRM_TYPES).
// Used by buildOwnerBooleanQuery to produce LinkedIn classic search strings that
// target owners directly instead of going through SerpAPI first.
const INDUSTRY_KEYWORDS = {
  cpa:             ['CPA', 'accounting', 'tax', 'accountant'],
  law:             ['attorney', 'law firm', 'lawyer', 'legal'],
  financial:       ['financial advisor', 'wealth', 'RIA', 'planner'],
  dental:          ['dental', 'dentist', 'DDS', 'orthodontist'],
  chiropractic:    ['chiropractor', 'chiropractic', 'DC'],
  real_estate:     ['real estate', 'realtor', 'broker'],
  insurance:       ['insurance agency', 'insurance broker'],
  veterinary:      ['veterinarian', 'veterinary', 'DVM', 'animal hospital'],
  contractor:      ['contractor', 'construction', 'builder', 'HVAC', 'plumbing'],
  physical_therapy:['physical therapy', 'physical therapist', 'PT clinic'],
};

// Unipile rejects boolean queries over ~80 chars ("content_too_large"). So we
// emit a short plain-text query: one owner word + one industry word. The result
// set is then filtered in pickBestOwner against the full OWNER_TITLE_KEYWORDS list.
function buildOwnerBooleanQuery(firmType) {
  const industry = (INDUSTRY_KEYWORDS[firmType] || [firmType])[0];
  return `owner ${industry}`;
}

// ── Heartbeat ─────────────────────────────────────────────
async function writeHeartbeat(detail = null) {
  await query(
    `INSERT INTO scheduler_heartbeats (name, last_run_at, last_detail)
     VALUES ('linkedin', NOW(), $1)
     ON CONFLICT (name) DO UPDATE SET last_run_at = NOW(), last_detail = EXCLUDED.last_detail`,
    [detail]
  ).catch(err => logger.warn({ err: err.message }, '[linkedin] heartbeat write failed'));
}

// ── Daily limit helpers ───────────────────────────────────
async function getTodayLimits() {
  const { rows } = await query(
    `INSERT INTO linkedin_daily_limits (date) VALUES (CURRENT_DATE)
     ON CONFLICT (date) DO UPDATE SET updated_at = NOW()
     RETURNING *`
  );
  return rows[0];
}

// ── Warming schedule ──────────────────────────────────────
// LinkedIn enforces a soft cap of ~100 connects/week on regular accounts. New
// automation must ramp slowly or LinkedIn will 30-day restrict the account.
// Caps grow with "days since first connect ever sent" — not calendar days — so
// a pause in automation doesn't reset the ramp.
const WARMING_PHASES = [
  { minDays: 0,  connects: 5,  dms: 5,  label: 'week-1' },
  { minDays: 5,  connects: 8,  dms: 8,  label: 'week-2' },
  { minDays: 10, connects: 12, dms: 12, label: 'week-3' },
  { minDays: 15, connects: 18, dms: 15, label: 'steady' },
];

async function getWarmingLimits() {
  const { rows } = await query(
    `SELECT MIN(connect_sent_at) AS first_sent FROM linkedin_leads WHERE connect_sent_at IS NOT NULL`
  );
  const firstSent = rows[0]?.first_sent;
  if (!firstSent) {
    const p = WARMING_PHASES[0];
    return { ...p, daysSinceStart: 0, source: 'warming' };
  }
  const days = Math.floor((Date.now() - new Date(firstSent).getTime()) / (24 * 60 * 60 * 1000));
  const phase = [...WARMING_PHASES].reverse().find(p => days >= p.minDays) || WARMING_PHASES[0];
  // Respect env-var ceiling if it's lower (allows emergency pause via Railway without redeploy)
  const envConnects = env.linkedinDailyConnectLimit;
  const envDms = env.linkedinDailyDmLimit;
  return {
    connects: Math.min(phase.connects, envConnects),
    dms: Math.min(phase.dms, envDms),
    label: phase.label,
    daysSinceStart: days,
    source: 'warming',
  };
}

async function bumpLimit(field) {
  await query(
    `UPDATE linkedin_daily_limits
     SET ${field} = ${field} + 1, updated_at = NOW()
     WHERE date = CURRENT_DATE`
  );
}

// ── 1. Discovery ──────────────────────────────────────────
// Direct LinkedIn boolean search: `(owner OR founder OR ...) AND (industry terms) city`.
// Skips SerpAPI entirely for the LinkedIn channel. Research (linkedhelper, salesrobot 2025)
// shows title+industry+city beats brand-name searches because most SMB owner headlines
// don't include the business name but DO include the owner title + industry.
async function discoverProspects({ maxProspects = 30 } = {}) {
  const mode = env.linkedinDiscoveryMode || 'linkedin_boolean';
  if (mode === 'serpapi_bridge') return discoverProspectsViaSerpAPI({ maxProspects });

  const firmTypes = leadgen.FIRM_TYPES.slice(0, 5); // 5 firm types × 8 cities = 40 searches/run
  const cities = leadgen.US_CITIES.slice(0, 8);
  const rawCandidates = [];

  for (const firm of firmTypes) {
    const boolQuery = buildOwnerBooleanQuery(firm.type);
    for (const city of cities) {
      let people;
      try {
        people = await unipile.searchPeople({
          keywords: `${boolQuery} ${city}`,
          limit: 10,
        });
      } catch (err) {
        logger.warn({ err: err.message, status: err.status, firm: firm.type, city }, '[linkedin] boolean search failed');
        continue;
      }
      const list = (people && (people.items || people.data || [])) || [];
      for (const p of list) {
        rawCandidates.push({ profile: p, firmType: firm.type, city });
      }
    }
  }

  // Flatten unique by provider id
  const seen = new Set();
  const unique = [];
  for (const c of rawCandidates) {
    const pid = c.profile.provider_id || c.profile.id || c.profile.public_identifier;
    if (!pid || seen.has(pid)) continue;
    seen.add(pid);
    unique.push({ ...c, providerId: pid });
  }

  // Dedupe against linkedin_leads rows already in the DB (any status)
  if (unique.length > 0) {
    const pids = unique.map(c => c.providerId);
    const { rows: existing } = await query(
      `SELECT linkedin_provider_id FROM linkedin_leads WHERE linkedin_provider_id = ANY($1)`,
      [pids]
    );
    const existingSet = new Set(existing.map(r => r.linkedin_provider_id));
    for (let i = unique.length - 1; i >= 0; i--) {
      if (existingSet.has(unique[i].providerId)) unique.splice(i, 1);
    }
  }

  // Quality-score + pick best per firm/city slot
  const found = [];
  for (const c of unique) {
    if (found.length >= maxProspects) break;
    const chosen = pickBestOwner({ items: [c.profile] }, '');
    if (!chosen) continue;
    // Derive business name from headline (best-effort — most headlines are "Title at Company")
    const businessName = extractCompanyFromHeadline(chosen.headline || chosen.title || '') || 'their practice';
    found.push({
      business: {
        business_name: businessName,
        website_url: null,
        city: c.city,
        state: null,
        business_type: c.firmType,
      },
      profile: chosen,
    });
  }
  return found;
}

// Legacy path kept behind LINKEDIN_DISCOVERY_MODE=serpapi_bridge for A/B safety.
async function discoverProspectsViaSerpAPI({ maxProspects = 30 } = {}) {
  const found = [];
  const firmTypes = leadgen.FIRM_TYPES.slice(0, 3);
  const cities = leadgen.US_CITIES.slice(0, 5);
  for (const firm of firmTypes) {
    for (const city of cities) {
      if (found.length >= maxProspects) break;
      const queryStr = `${firm.queries[0]} ${city}`;
      let businesses;
      try { businesses = await leadgen.searchSerpAPI(queryStr); }
      catch (err) { logger.warn({ err: err.message, queryStr }, '[linkedin] serpapi search failed'); continue; }
      for (const raw of businesses.slice(0, 2)) {
        if (found.length >= maxProspects) break;
        const biz = {
          business_name: (raw.title || '').replace(/\s*[-|–—].*$/, '').trim(),
          website_url: raw.link || null,
          city, state: null,
        };
        if (!biz.business_name) continue;
        let people;
        try {
          people = await unipile.searchPeople({ keywords: `${biz.business_name} ${city}`, limit: 5 });
        } catch (err) { logger.warn({ err: err.message, business: biz.business_name }, '[linkedin] people search failed'); continue; }
        const profile = pickBestOwner(people, biz.business_name);
        if (!profile) continue;
        found.push({ business: { ...biz, business_type: firm.type }, profile });
      }
    }
  }
  return found;
}

// "Owner @ Smile Dental" / "Owner at Smile Dental | Orthodontist" → "Smile Dental"
function extractCompanyFromHeadline(headline) {
  if (!headline) return null;
  const m = headline.match(/\b(?:at|@|—|-|\|)\s+([^|•\-—]{3,60})/i);
  if (!m) return null;
  return m[1].trim().replace(/\s+/g, ' ');
}

function pickBestOwner(searchResult, businessName) {
  const list = (searchResult && (searchResult.items || searchResult.data || [])) || [];
  const bizTokens = (businessName || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 3 && !['the', 'and', 'llc', 'inc', 'co'].includes(t));

  // Hard quality gate: reject inactive/blank accounts.
  // Require (a) a profile picture and (b) a headline ≥ 20 chars.
  const hasSignal = (p) => {
    const headline = (p.headline || p.title || '').trim();
    if (headline.length < 20) return false;
    const pic = p.profile_picture_url || p.profile_picture_url_large || p.picture_url || null;
    if (!pic) return false;
    return true;
  };

  const scored = list.filter(hasSignal).map(p => {
    const headline = (p.headline || p.title || '').toLowerCase();
    const titleHit = OWNER_TITLE_KEYWORDS.some(k => headline.includes(k.toLowerCase()));
    const bizHit = bizTokens.length > 0 && bizTokens.some(t => headline.includes(t));
    // Require at least one strong signal — owner title OR business-name overlap in headline.
    const score = (titleHit ? 2 : 0) + (bizHit ? 2 : 0) + (headline.length > 30 ? 1 : 0);
    return { p, score, titleHit, bizHit };
  });

  // Only accept profiles with at least one real signal (score >= 2).
  const qualified = scored.filter(s => s.score >= 2).sort((a, b) => b.score - a.score);
  return qualified.length > 0 ? qualified[0].p : null;
}

// ── 2. Insert + diagnose + enrich ─────────────────────────
// Pulls the full profile (about, recent post, follower count) from Unipile so
// the personalization prompt has concrete hooks. Falls back silently on error.
async function fetchEnrichment(providerId) {
  if (!providerId) return null;
  try {
    const full = await unipile.getProfile(providerId);
    const about = full.summary || full.about || '';
    // Unipile's profile response may include `activity` / `posts` depending on plan.
    // Try a few likely shapes — defensive since schema varies.
    const postCandidates = full.recent_posts || full.activity || full.posts || [];
    const recentPost = Array.isArray(postCandidates) && postCandidates.length > 0
      ? (postCandidates[0].text || postCandidates[0].content || postCandidates[0].summary || '').slice(0, 400)
      : null;
    return {
      about_snippet: about.slice(0, 600) || null,
      recent_post_snippet: recentPost || null,
      profile_picture_url: full.profile_picture_url || full.profile_picture_url_large || null,
    };
  } catch (err) {
    logger.warn({ err: err.message, providerId }, '[linkedin] profile enrichment failed');
    return null;
  }
}

async function insertProspect({ business, profile }, diagnosis) {
  const providerId = profile.provider_id || profile.id || profile.public_identifier || null;
  const url = profile.profile_url || profile.public_profile_url || (providerId ? `https://www.linkedin.com/in/${providerId}` : null);
  if (!url) return null;
  const firstName = (profile.first_name || (profile.name || '').split(' ')[0] || '').trim();

  // Enrich via getProfile so we have a real recent-post hook if available.
  const enrichment = await fetchEnrichment(providerId);
  const aboutSnippet = (enrichment?.about_snippet) || (profile.summary || profile.about || '').slice(0, 600) || null;
  const recentPost = enrichment?.recent_post_snippet || null;
  const pictureUrl = enrichment?.profile_picture_url || profile.profile_picture_url || profile.profile_picture_url_large || null;

  const { rows } = await query(
    `INSERT INTO linkedin_leads (
       business_name, business_website, business_city, business_state, business_type,
       contact_name, contact_first_name, contact_title,
       linkedin_url, linkedin_provider_id, about_snippet, last_activity_at,
       diagnosis_json, score, status,
       recent_post_snippet, profile_picture_url
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'enriched',$15,$16
     )
     ON CONFLICT (linkedin_url) DO NOTHING
     RETURNING *`,
    [
      business.business_name, business.website_url || null, business.city || null, business.state || null, business.business_type || null,
      profile.name || null, firstName || null, profile.headline || profile.title || null,
      url, providerId, aboutSnippet, null,
      diagnosis ? JSON.stringify(diagnosis) : null,
      diagnosis ? leadgen.scoreLead(diagnosis) : 0,
      recentPost, pictureUrl,
    ]
  );
  return rows[0] || null;
}

// ── 3. Personalization ────────────────────────────────────
// Research-backed prompt (2025 LinkedIn outreach benchmarks):
//   - 300-char connect note cap (premium), NO link, NO pitch, NO CTA — research shows CTAs in connect notes LOWER accept rates
//   - Personalization beyond first name → +340% reply rate (Outreaches 2025)
//   - Recent-post reference boosts reply 32% (Reply.io)
//   - First DM ≤ 500 chars with ONE concrete outcome + ONE close-ended CTA
const CONNECT_NOTE_MAX = 200; // LinkedIn non-premium hard cap
const FIRST_DM_MAX = 500;

function buildPersonalizePrompt(lead, { tighten = false } = {}) {
  const diagnosis = lead.diagnosis_json
    ? (typeof lead.diagnosis_json === 'string' ? JSON.parse(lead.diagnosis_json) : lead.diagnosis_json)
    : {};
  const topGap = !diagnosis.has_booking_software ? 'no online booking'
    : !diagnosis.has_intake_forms ? 'paper intake forms'
    : !diagnosis.has_client_portal ? 'no client portal'
    : 'outdated workflow';

  // If the business name is really just "<First Last>, CPA, PC" style, strip the person's name
  // so the hook says "your practice" instead of literally repeating their own name back at them.
  const firstName = (lead.contact_first_name || '').trim();
  const lastName = (lead.contact_name || '').replace(firstName, '').trim();
  let displayBusiness = lead.business_name || '';
  const looksLikePersonName = firstName && (
    displayBusiness.toLowerCase().startsWith(firstName.toLowerCase()) ||
    (lastName && displayBusiness.toLowerCase().includes(lastName.toLowerCase()))
  );
  if (looksLikePersonName) displayBusiness = 'your practice';
  // Clean trailing "CPA, PC" / "LLC" / "DDS" suffixes from display
  displayBusiness = displayBusiness.replace(/,?\s*(P\.?C\.?|L\.?L\.?C\.?|Inc\.?|PLLC|DDS|CPA|DMD|DVM|P\.?A\.?)\b.*$/i, '').trim() || 'your practice';

  // Hook priority: (1) recent post, (2) business + diagnosis finding, (3) city + industry.
  const hookHint = lead.recent_post_snippet
    ? `HOOK: Reference this recent post: "${lead.recent_post_snippet.slice(0, 200)}"`
    : displayBusiness && displayBusiness !== 'your practice'
      ? `HOOK: Reference ${displayBusiness} + the diagnosis finding "${topGap}"`
      : `HOOK: Reference the ${lead.business_city || 'local'} ${lead.business_type || ''} scene and the "${topGap}" gap — DO NOT use the business name, use "your practice" instead`;

  return `You are Nate Linder — a student at Abilene Christian University (ACU) building MonkFlow, a small automation platform for service businesses. You are reaching out personally, founder-to-owner. Not a rep, not a sales team.

Generate a LinkedIn connection note + first DM. Return ONLY valid JSON.

PROSPECT
- First name: ${firstName || 'there'}
- Title: ${lead.contact_title || 'unknown'}
- Business (for context): ${displayBusiness}
- City: ${lead.business_city || ''}
- Industry: ${lead.business_type || ''}
- Diagnosis gap: ${topGap}
- About: ${(lead.about_snippet || '').slice(0, 300)}
- Recent post: ${lead.recent_post_snippet ? lead.recent_post_snippet.slice(0, 200) : 'none'}

${hookHint}

CONNECT NOTE — HARD RULES (≤${CONNECT_NOTE_MAX} chars${tighten ? ' — PREVIOUS ATTEMPT WAS TOO LONG, TIGHTEN' : ''}):
- Open with "${firstName || 'Hey'}," — use first name ONLY, never the full business name
- Introduce yourself briefly: "I'm Nate, an ACU student building a tiny automation tool for ${lead.business_type || 'practices'} like yours"
- Then ONE specific reference from the hook above (use "your practice" instead of repeating their name back at them)
- End with a SOFT value line like "Figured you'd get what I'm building" — NOT a CTA, NOT a question
- NEVER: link, URL, "quick chat", "20 min", "would love to", "reaching out", "touching base", "I noticed", repeat the business name if it contains the prospect's own name, the word "MonkFlow"
- Sign nothing (LinkedIn shows your name)

FIRST DM — HARD RULES (≤${FIRST_DM_MAX} chars${tighten ? ' — PREVIOUS ATTEMPT WAS TOO LONG, TIGHTEN' : ''}):
- Thank them for connecting in 5 words max
- Remind them you're a student founder: "Quick context — I'm building MonkFlow solo out of Abilene, focused on ${lead.business_type || 'small practices'}"
- State ONE specific outcome with a NUMBER (e.g. "cut 4 hrs/week off booking coordination for a 3-person practice")
- Exactly ONE close-ended CTA on its own line: "Worth a 15-min look? Yes or no."
- Sign "— Nate"

Return ONLY: {"connectNote": "...", "firstDM": "..."}`;
}

async function personalize(lead) {
  if (!env.anthropicApiKey) throw new Error('ANTHROPIC_API_KEY required');
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: env.anthropicApiKey });

  async function callOnce(tighten) {
    const prompt = buildPersonalizePrompt(lead, { tighten });
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: tighten ? 450 : 600,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = response.content[0].text;
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('Personalize: no JSON in response');
    const parsed = JSON.parse(m[0]);
    return {
      connectNote: (parsed.connectNote || '').trim(),
      firstDM: (parsed.firstDM || '').trim(),
    };
  }

  let result = await callOnce(false);
  // Pre-validate char counts; retry once if over, then hard-truncate as a last resort.
  if (result.connectNote.length > CONNECT_NOTE_MAX || result.firstDM.length > FIRST_DM_MAX) {
    try {
      result = await callOnce(true);
    } catch (err) {
      logger.warn({ err: err.message, leadId: lead.id }, '[linkedin] personalize retry failed');
    }
  }
  return {
    connectNote: result.connectNote.slice(0, CONNECT_NOTE_MAX),
    firstDM: result.firstDM.slice(0, FIRST_DM_MAX),
  };
}

// ── 4. Send connect requests ──────────────────────────────
async function sendConnects() {
  const limits = await getTodayLimits();
  const warming = await getWarmingLimits();
  const remaining = warming.connects - (limits.connects_sent || 0);
  logger.info({ warmingCap: warming.connects, sent: limits.connects_sent, remaining }, '[linkedin] sendConnects limits');
  if (remaining <= 0) return { sent: 0, reason: 'cap_reached' };

  const { rows } = await query(
    `SELECT * FROM linkedin_leads WHERE status = 'personalized' ORDER BY score DESC, created_at ASC LIMIT $1`,
    [remaining]
  );
  logger.info({ candidates: rows.length, ids: rows.map(r => r.id) }, '[linkedin] sendConnects candidates');

  let sent = 0;
  const errors = [];
  for (const lead of rows) {
    try {
      logger.info({ leadId: lead.id, providerId: lead.linkedin_provider_id, noteLen: (lead.connect_note||'').length }, '[linkedin] sending connect');
      const result = await unipile.sendConnectionRequest(lead.linkedin_provider_id, lead.connect_note);
      logger.info({ leadId: lead.id, result }, '[linkedin] connect result');
      const inviteId = (result && (result.invitation_id || result.id)) || null;
      await query(
        `UPDATE linkedin_leads SET status='connect_sent', connect_sent_at=NOW(), unipile_invite_id=$2, last_touch_at=NOW(), touch_count=touch_count+1, updated_at=NOW() WHERE id=$1`,
        [lead.id, inviteId]
      );
      await bumpLimit('connects_sent');
      sent++;
    } catch (err) {
      logger.warn({ err: err.message, status: err.status, body: err.body, leadId: lead.id }, '[linkedin] connect request failed');
      errors.push({ leadId: lead.id, error: err.message.slice(0, 200), status: err.status });
      await query(`UPDATE linkedin_leads SET error=$2, updated_at=NOW() WHERE id=$1`, [lead.id, err.message.slice(0, 500)]);
      if (err.status === 429) break; // hard stop on rate limit
    }
  }
  return { sent, candidates: rows.length, remaining, warmingCap: warming.connects, todaySent: limits.connects_sent, errors };
}

// ── 5. Send first DMs to accepted connections ────────────
async function sendDMs() {
  const limits = await getTodayLimits();
  const warming = await getWarmingLimits();
  const remaining = warming.dms - (limits.dms_sent || 0);
  if (remaining <= 0) return { sent: 0, reason: 'cap_reached' };

  const { rows } = await query(
    `SELECT * FROM linkedin_leads WHERE status = 'connected' AND first_dm IS NOT NULL ORDER BY connected_at ASC LIMIT $1`,
    [remaining]
  );

  let sent = 0;
  for (const lead of rows) {
    try {
      const result = await unipile.sendMessage({ providerId: lead.linkedin_provider_id, text: lead.first_dm });
      const chatId = (result && (result.chat_id || result.id)) || null;
      await query(
        `UPDATE linkedin_leads SET status='dm_sent', dm_sent_at=NOW(), unipile_chat_id=COALESCE(unipile_chat_id, $2), last_touch_at=NOW(), touch_count=touch_count+1, updated_at=NOW() WHERE id=$1`,
        [lead.id, chatId]
      );
      await bumpLimit('dms_sent');
      sent++;
    } catch (err) {
      logger.warn({ err: err.message, leadId: lead.id }, '[linkedin] DM send failed');
      await query(`UPDATE linkedin_leads SET error=$2, updated_at=NOW() WHERE id=$1`, [lead.id, err.message.slice(0, 500)]);
      if (err.status === 429) break;
    }
  }
  return { sent };
}

// ── Owner summary email ──────────────────────────────────
async function sendOwnerSummary(stats) {
  const to = process.env.OWNER_NOTIFICATION_EMAIL || env.outreachFromEmail;
  const html = `
    <div style="font-family:sans-serif;max-width:600px;">
      <h2 style="color:#0a66c2;">LinkedIn Outreach — Daily Summary</h2>
      <ul style="font-size:14px;line-height:1.7;">
        <li>Discovered: ${stats.discovered ?? 0}</li>
        <li>Enriched: ${stats.enriched ?? 0}</li>
        <li>Personalized: ${stats.personalized ?? 0}</li>
        <li>Connects sent: <strong>${stats.connectsSent ?? 0}</strong> / ${env.linkedinDailyConnectLimit}</li>
        <li>DMs sent: <strong>${stats.dmsSent ?? 0}</strong> / ${env.linkedinDailyDmLimit}</li>
        <li>Errors: ${stats.errors ?? 0}</li>
      </ul>
      ${stats.error ? `<p style="color:#ef4444;">Run error: ${stats.error}</p>` : ''}
      <p><a href="${env.frontendUrl}/admin" style="background:#0a66c2;color:#fff;padding:10px 18px;text-decoration:none;border-radius:6px;display:inline-block;">Open admin dashboard</a></p>
    </div>`;
  await sendEmail({ to, subject: `LinkedIn outreach: ${stats.connectsSent || 0} connects, ${stats.dmsSent || 0} DMs`, html }).catch(err => logger.warn({ err: err.message }, '[linkedin] summary email failed'));
}

// ── Orchestrator ──────────────────────────────────────────
async function runDailyLinkedInRun({ dryRun = false } = {}) {
  const stats = { discovered: 0, enriched: 0, personalized: 0, connectsSent: 0, dmsSent: 0, errors: 0 };
  await writeHeartbeat('starting');
  try {
    if (!env.linkedinOutreachEnabled) {
      await writeHeartbeat('disabled');
      return { ok: true, stats, reason: 'disabled' };
    }

    // 1. Discover
    const discovered = await discoverProspects({ maxProspects: env.linkedinDailyConnectLimit * 2 });
    stats.discovered = discovered.length;

    // 2. Diagnose business + insert
    for (const item of discovered) {
      let diagnosis = null;
      if (item.business.website_url) {
        try { diagnosis = await leadgen.diagnoseWebsite(item.business.website_url); } catch (err) { logger.warn({ err: err.message }, '[linkedin] diagnose failed'); }
      }
      try {
        const inserted = await insertProspect(item, diagnosis);
        if (inserted) stats.enriched++;
      } catch (err) {
        logger.warn({ err: err.message, stack: err.stack, business: item.business?.business_name }, '[linkedin] insert failed');
        stats.errors++;
        if (!stats.firstError) stats.firstError = err.message;
      }
    }

    // 3. Personalize all `enriched` leads
    const { rows: enriched } = await query(`SELECT * FROM linkedin_leads WHERE status='enriched' ORDER BY score DESC, created_at DESC LIMIT 30`);
    for (const lead of enriched) {
      try {
        const { connectNote, firstDM } = await personalize(lead);
        await query(
          `UPDATE linkedin_leads SET connect_note=$2, first_dm=$3, status='personalized', updated_at=NOW() WHERE id=$1`,
          [lead.id, connectNote, firstDM]
        );
        stats.personalized++;
      } catch (err) {
        logger.warn({ err: err.message, leadId: lead.id }, '[linkedin] personalize failed');
        stats.errors++;
      }
    }

    if (!dryRun) {
      // 4. Send connects
      const c = await sendConnects();
      stats.connectsSent = c.sent;
      stats._connectDebug = c;
      // 5. Send DMs to accepted
      const d = await sendDMs();
      stats.dmsSent = d.sent;
      stats._dmDebug = d;
    }

    await sendOwnerSummary(stats);
    await writeHeartbeat(`ok: ${stats.connectsSent}c/${stats.dmsSent}d`);
    // Fire-and-forget daily summary push (no await so a push hiccup can't break the run)
    if (!dryRun) {
      pushover.sendDailySummary({
        scheduler: 'LinkedIn',
        lines: [
          `Discovered: ${stats.discovered}`,
          `Personalized: ${stats.personalized}`,
          `Connects sent: ${stats.connectsSent}`,
          `DMs sent: ${stats.dmsSent}`,
          stats.errors ? `⚠️ Errors: ${stats.errors}` : null,
        ],
        url: `${env.frontendUrl}/admin`,
      }).catch(() => {});
    }
    return { ok: true, stats };
  } catch (err) {
    stats.error = err.message;
    logger.error({ err: err.message, stack: err.stack }, '[linkedin] daily run failed');
    await writeHeartbeat(`error: ${err.message.slice(0, 100)}`);
    await sendOwnerSummary(stats);
    pushover.sendSchedulerFailure({ scheduler: 'LinkedIn', error: err.message }).catch(() => {});
    return { ok: false, stats, error: err.message };
  }
}

module.exports = {
  runDailyLinkedInRun,
  discoverProspects,
  personalize,
  sendConnects,
  sendDMs,
  getTodayLimits,
  getWarmingLimits,
  bumpLimit,
  writeHeartbeat,
};
