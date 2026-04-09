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

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const OWNER_TITLE_KEYWORDS = ['owner', 'founder', 'partner', 'president', 'CEO', 'managing director', 'principal'];

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

async function bumpLimit(field) {
  await query(
    `UPDATE linkedin_daily_limits
     SET ${field} = ${field} + 1, updated_at = NOW()
     WHERE date = CURRENT_DATE`
  );
}

// ── 1. Discovery ──────────────────────────────────────────
async function discoverProspects({ maxBusinesses = 30 } = {}) {
  const found = [];
  const firmTypes = leadgen.FIRM_TYPES.slice(0, 3); // small daily slice
  const cities = leadgen.US_CITIES.slice(0, 5);

  for (const firm of firmTypes) {
    for (const city of cities) {
      if (found.length >= maxBusinesses) break;
      const queryStr = `${firm.queries[0]} ${city}`;
      let businesses;
      try {
        businesses = await leadgen.searchSerpAPI(queryStr);
      } catch (err) {
        logger.warn({ err: err.message, queryStr }, '[linkedin] serpapi search failed');
        continue;
      }
      for (const raw of businesses.slice(0, 2)) {
        if (found.length >= maxBusinesses) break;
        // SerpAPI returns {title, link, snippet} — normalize to our schema
        const biz = {
          business_name: (raw.title || '').replace(/\s*[-|–—].*$/, '').trim(),
          website_url: raw.link || null,
          city: city,
          state: null,
        };
        if (!biz.business_name) continue;
        // Look up the owner on LinkedIn via Unipile
        let people;
        // Two-pass search: (1) business name + city for precision, (2) title + city fallback for recall.
        const cityName = biz.city || city;
        try {
          people = await unipile.searchPeople({
            keywords: `${biz.business_name} ${cityName}`,
            limit: 5,
          });
          const hasResults = people && (people.items || people.data || []).length > 0;
          if (!hasResults) {
            people = await unipile.searchPeople({
              keywords: `owner ${biz.business_type || firm.type} ${cityName}`,
              limit: 5,
            });
          }
        } catch (err) {
          logger.warn({ err: err.message, status: err.status, body: err.body, business: biz.business_name }, '[linkedin] people search failed');
          continue;
        }
        const profile = pickBestOwner(people, biz.business_name);
        if (!profile) continue;
        found.push({ business: { ...biz, business_type: firm.type }, profile });
      }
    }
  }
  return found;
}

function pickBestOwner(searchResult, businessName) {
  const list = (searchResult && (searchResult.items || searchResult.data || [])) || [];
  for (const p of list) {
    const title = (p.headline || p.title || '').toLowerCase();
    if (OWNER_TITLE_KEYWORDS.some(k => title.includes(k.toLowerCase()))) {
      return p;
    }
  }
  return list[0] || null;
}

// ── 2. Insert + diagnose ──────────────────────────────────
async function insertProspect({ business, profile }, diagnosis) {
  const providerId = profile.provider_id || profile.id || profile.public_identifier || null;
  const url = profile.profile_url || (providerId ? `https://www.linkedin.com/in/${providerId}` : null);
  if (!url) return null;
  const firstName = (profile.first_name || (profile.name || '').split(' ')[0] || '').trim();

  const { rows } = await query(
    `INSERT INTO linkedin_leads (
       business_name, business_website, business_city, business_state, business_type,
       contact_name, contact_first_name, contact_title,
       linkedin_url, linkedin_provider_id, about_snippet, last_activity_at,
       diagnosis_json, score, status
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'enriched'
     )
     ON CONFLICT (linkedin_url) DO NOTHING
     RETURNING *`,
    [
      business.business_name, business.website_url || null, business.city || null, business.state || null, business.business_type || null,
      profile.name || null, firstName || null, profile.headline || profile.title || null,
      url, providerId, (profile.summary || profile.about || '').slice(0, 1000), null,
      diagnosis ? JSON.stringify(diagnosis) : null,
      diagnosis ? leadgen.scoreLead(diagnosis) : 0,
    ]
  );
  return rows[0] || null;
}

// ── 3. Personalization ────────────────────────────────────
async function personalize(lead) {
  if (!env.anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY required');
  }
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: env.anthropicApiKey });

  const diagnosis = lead.diagnosis_json ? (typeof lead.diagnosis_json === 'string' ? JSON.parse(lead.diagnosis_json) : lead.diagnosis_json) : {};
  const topGap = !diagnosis.has_booking_software ? 'no online booking'
    : !diagnosis.has_intake_forms ? 'paper intake forms'
    : !diagnosis.has_client_portal ? 'no client portal' : 'outdated workflow';

  const framework = Math.random() < 0.5 ? 'insight' : 'question';
  const prompt = `You are Nathan Linder, founder of MonkFlow (an automation platform for small service businesses).

Generate a LinkedIn connection note + first DM for this prospect. Return ONLY valid JSON.

Prospect:
- Name: ${lead.contact_first_name || 'there'} (${lead.contact_name || ''})
- Title: ${lead.contact_title || 'unknown'}
- Business: ${lead.business_name}
- City: ${lead.business_city || ''}
- Type: ${lead.business_type || ''}
- Top gap: ${topGap}
- About snippet: ${(lead.about_snippet || '').slice(0, 400)}

FRAMEWORK: ${framework === 'insight' ? '"Insight lead" — open with one specific observation about their business that hints at the gap' : '"Question lead" — open with a single close-ended interest question about the gap'}

CONNECT NOTE (≤280 chars):
- Reference one CONCRETE thing about ${lead.business_name}
- End with a single close-ended interest question (yes/no)
- NEVER say "I noticed", "reaching out", "touching base", "quick chat", "I'd love to"
- NO link
- Sign nothing — LinkedIn shows your name

FIRST DM (≤500 chars, sent ONLY after they accept):
- Reference the connect note conversationally
- Tie to one specific outcome with a number (e.g. "took a 4-provider Tulsa dental office from 18 hrs/week on scheduling to 2")
- End with: "20-min call this week? Free, no pitch."
- Sign "Nathan"

Return: {"connectNote": "...", "firstDM": "..."}`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 600,
    messages: [{ role: 'user', content: prompt }],
  });
  const text = response.content[0].text;
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('Personalize: no JSON in response');
  const parsed = JSON.parse(m[0]);
  return { connectNote: (parsed.connectNote || '').slice(0, 280), firstDM: (parsed.firstDM || '').slice(0, 500) };
}

// ── 4. Send connect requests ──────────────────────────────
async function sendConnects() {
  const limits = await getTodayLimits();
  const remaining = env.linkedinDailyConnectLimit - (limits.connects_sent || 0);
  if (remaining <= 0) return { sent: 0, reason: 'cap_reached' };

  const { rows } = await query(
    `SELECT * FROM linkedin_leads WHERE status = 'personalized' ORDER BY score DESC, created_at ASC LIMIT $1`,
    [remaining]
  );

  let sent = 0;
  for (const lead of rows) {
    try {
      const result = await unipile.sendConnectionRequest(lead.linkedin_provider_id, lead.connect_note);
      const inviteId = (result && (result.invitation_id || result.id)) || null;
      await query(
        `UPDATE linkedin_leads SET status='connect_sent', connect_sent_at=NOW(), unipile_invite_id=$2, last_touch_at=NOW(), touch_count=touch_count+1, updated_at=NOW() WHERE id=$1`,
        [lead.id, inviteId]
      );
      await bumpLimit('connects_sent');
      sent++;
    } catch (err) {
      logger.warn({ err: err.message, leadId: lead.id }, '[linkedin] connect request failed');
      await query(`UPDATE linkedin_leads SET error=$2, updated_at=NOW() WHERE id=$1`, [lead.id, err.message.slice(0, 500)]);
      if (err.status === 429) break; // hard stop on rate limit
    }
  }
  return { sent };
}

// ── 5. Send first DMs to accepted connections ────────────
async function sendDMs() {
  const limits = await getTodayLimits();
  const remaining = env.linkedinDailyDmLimit - (limits.dms_sent || 0);
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
    const discovered = await discoverProspects({ maxBusinesses: env.linkedinDailyConnectLimit * 2 });
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
    const { rows: enriched } = await query(`SELECT * FROM linkedin_leads WHERE status='enriched' ORDER BY score DESC LIMIT $1`, [env.linkedinDailyConnectLimit * 2]);
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
      // 5. Send DMs to accepted
      const d = await sendDMs();
      stats.dmsSent = d.sent;
    }

    await sendOwnerSummary(stats);
    await writeHeartbeat(`ok: ${stats.connectsSent}c/${stats.dmsSent}d`);
    return { ok: true, stats };
  } catch (err) {
    stats.error = err.message;
    logger.error({ err: err.message, stack: err.stack }, '[linkedin] daily run failed');
    await writeHeartbeat(`error: ${err.message.slice(0, 100)}`);
    await sendOwnerSummary(stats);
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
  bumpLimit,
  writeHeartbeat,
};
