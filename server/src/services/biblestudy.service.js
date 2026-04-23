/**
 * biblestudy.service.js
 *
 * Daily Bible study email digest — single entry point: generateAndSendDailyStudy().
 *
 * Flow:
 *   1. Idempotency guard   — SELECT from daily_studies where study_date = today
 *   2. Pick today's verse  — day_of_year lookup into bible-study-verses.json
 *   3. Ask Claude          — structured JSON (title, summary, context, words,
 *                            cross_references, commentary, application, prayer)
 *   4. Store in Postgres   — daily_studies row, UNIQUE guard on study_date
 *   5. Render HTML + text  — email body with clean typography
 *   6. Send via Resend     — from noreply@getmonkflow.com (NOT outreach domain)
 *   7. Stamp email_sent_at + email_id on the row
 *
 * Failure modes handled:
 *   - Retry after partial failure (row inserted, email throw) → resumes at send
 *   - Claude unavailable → thrown, scheduler catches and heartbeats 'failed'
 *   - Resend unavailable → row remains with email_sent_at=NULL for manual replay
 *   - UNIQUE violation on concurrent fires → caught, existing row reused
 */

const fs = require('fs');
const path = require('path');
const env = require('../config/env');
const { query } = require('../config/database');
const emailService = require('./email.service');
const { escapeHtml } = require('./leadgen.service');

// ── Verse list (loaded once at module scope) ──────────────────────

let VERSES = null;
function loadVerses() {
  if (VERSES) return VERSES;
  const file = path.join(__dirname, '..', '..', 'data', 'bible-study-verses.json');
  VERSES = JSON.parse(fs.readFileSync(file, 'utf-8'));
  return VERSES;
}

function dayOfYearUTC(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  const d = date.getUTCDate();
  return Math.floor((Date.UTC(y, m, d) - Date.UTC(y, 0, 0)) / 86400000);
}

function pickVerse(date = new Date()) {
  const verses = loadVerses();
  let doy = dayOfYearUTC(date);
  // Leap-year Feb 29 = doy 60. Our list only has 1..365.
  // Fall back to doy 59 for that single day (reuses Feb 28's verse).
  if (doy > 365) doy = 59;
  const v = verses.find(x => x.day_of_year === doy);
  if (!v) throw new Error(`No verse found for day_of_year=${doy}`);
  return v;
}

// ── Claude prompt ────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a biblical scholar writing a daily deep-dive Bible study for an
educated Christian reader. You hold to historic Protestant orthodoxy
(Reformed / evangelical). Your training includes Strong's Concordance,
BDB Hebrew lexicon, Thayer's Greek lexicon, Matthew Henry, Calvin's
Institutes, the Westminster Standards, and standard modern commentaries
(NICNT, NICOT, Tyndale, ZECNT, Pillar).

Return ONLY valid JSON. No markdown, no code fences. This JSON must
parse cleanly with JSON.parse().

Schema:
{
  "title": "short evocative title for the day, 3-7 words",
  "summary": "one-paragraph overview (80-120 words) of what the passage
              is teaching and why it matters",
  "context": {
    "historical": "2-4 sentences on the historical/cultural setting",
    "literary":   "2-4 sentences on where it sits in the book's flow"
  },
  "words": [
    {
      "original":    "the Greek or Hebrew word in its native script",
      "transliteration": "Romanized form",
      "strongs":     "Strong's number if known, e.g. H7225 or G26",
      "part_of_speech": "noun/verb/etc",
      "gloss":       "one-line English gloss",
      "notes":       "3-5 sentences: root meaning, semantic range, how
                      it's used elsewhere in Scripture, why the choice
                      of THIS word matters here"
    }
  ],
  "cross_references": [
    {
      "reference": "e.g. John 1:1",
      "text":      "the full verse text",
      "connection": "1-2 sentences on why this cross-reference
                     illuminates today's passage"
    }
  ],
  "commentary": "400-600 words of substantive exegetical commentary.
                 Work the text clause-by-clause. Bring in the original
                 language insight. Name the major interpretive options
                 where relevant and indicate which is most defensible.",
  "application": "2-3 paragraphs (150-250 words) on how this text
                  forms faith and life — prayer, worship, obedience,
                  hope. Avoid moralism. Keep it Christ-centered.",
  "prayer":     "a short written prayer (40-80 words) that responds
                 to today's text in first person plural"
}

Requirements:
- 4-7 key words in "words". Prefer the theologically weighty terms
  (names of God, covenant terms, key verbs, rare words).
- 4-6 cross-references. Span both Testaments when possible.
- Ground ALL claims in the actual text — no speculation beyond the
  passage.
- No sectarian polemics. No prosperity theology. No political commentary.
- If you are uncertain of a Strong's number, omit the field rather
  than guess.`;

async function generateAnalysis(verse) {
  if (!env.anthropicApiKey) {
    throw new Error('Bible study unavailable: ANTHROPIC_API_KEY not set');
  }

  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: env.anthropicApiKey });

  const userPrompt = `Today's passage:
Reference: ${verse.reference}
Original language: ${verse.original_language}
Testament: ${verse.testament}
Theme: ${verse.theme}

Text (analyze EXACTLY this wording, do not paraphrase):
"${verse.text}"

Produce the JSON now.`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    temperature: 0.4,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const text = response.content[0]?.text || '';
  console.log(`[BibleStudy] Claude returned ${text.length} chars`);

  // Parse JSON — try direct, then regex extract, then throw
  try {
    const parsed = JSON.parse(text);
    validateAnalysis(parsed);
    return parsed;
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        validateAnalysis(parsed);
        return parsed;
      } catch (e) {
        throw new Error(`Failed to parse Claude response as JSON: ${e.message}`);
      }
    }
    throw new Error('Failed to parse Claude response as JSON (no JSON block found)');
  }
}

function validateAnalysis(a) {
  const required = ['title', 'summary', 'context', 'words', 'cross_references', 'commentary', 'application', 'prayer'];
  for (const k of required) {
    if (!a[k]) throw new Error(`Analysis missing required field: ${k}`);
  }
  if (!a.context.historical || !a.context.literary) throw new Error('Analysis missing context.historical or context.literary');
  if (!Array.isArray(a.words) || a.words.length === 0) throw new Error('Analysis must include at least one word entry');
  if (!Array.isArray(a.cross_references) || a.cross_references.length === 0) throw new Error('Analysis must include at least one cross-reference');
}

// ── Email rendering ──────────────────────────────────────────────

function formatLongDate(date = new Date()) {
  return date.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'America/Chicago',
  });
}

function renderEmailHtml(verse, analysis, date = new Date()) {
  const dateStr = formatLongDate(date);

  const wordsHtml = analysis.words.map(w => `
    <div style="margin: 20px 0; padding: 14px; background: #fafafa; border-radius: 6px;">
      <p style="margin: 0; font-size: 22px;">${escapeHtml(w.original || '')}
        <span style="font-size: 14px; color: #666;">
          (${escapeHtml(w.transliteration || '')}${w.strongs ? ` &middot; ${escapeHtml(w.strongs)}` : ''})
        </span>
      </p>
      <p style="margin: 4px 0; font-size: 14px; color: #666;">
        ${escapeHtml(w.part_of_speech || '')} &middot; &ldquo;${escapeHtml(w.gloss || '')}&rdquo;
      </p>
      <p style="margin: 8px 0 0;">${escapeHtml(w.notes || '')}</p>
    </div>
  `).join('');

  const xrefsHtml = analysis.cross_references.map(x => `
    <div style="margin: 16px 0;">
      <p style="margin: 0;"><strong>${escapeHtml(x.reference || '')}</strong> &mdash;
        <em>${escapeHtml(x.text || '')}</em></p>
      <p style="margin: 4px 0 0; color: #444;">${escapeHtml(x.connection || '')}</p>
    </div>
  `).join('');

  const commentaryHtml = String(analysis.commentary).split(/\n\n+/).map(p => `<p>${escapeHtml(p)}</p>`).join('');
  const applicationHtml = String(analysis.application).split(/\n\n+/).map(p => `<p>${escapeHtml(p)}</p>`).join('');

  return `<div style="font-family: Georgia, 'Times New Roman', serif; max-width: 640px; margin: 0 auto; color: #1a1a1a; line-height: 1.6; padding: 24px;">

  <h1 style="font-size: 28px; margin-bottom: 4px; line-height: 1.25;">${escapeHtml(analysis.title)}</h1>
  <p style="color: #666; font-size: 14px; margin-top: 0;">${escapeHtml(verse.reference)} &middot; ${escapeHtml(dateStr)}</p>

  <blockquote style="border-left: 4px solid #00cc6a; padding: 12px 18px; margin: 24px 0;
                     font-size: 18px; font-style: italic; background: #f8f8f8; border-radius: 0 6px 6px 0;">
    ${escapeHtml(verse.text)}
  </blockquote>

  <p style="font-size: 16px;">${escapeHtml(analysis.summary)}</p>

  <h2 style="font-size: 20px; margin-top: 36px; border-bottom: 1px solid #eee; padding-bottom: 6px;">Context</h2>
  <p><strong>Historical:</strong> ${escapeHtml(analysis.context.historical)}</p>
  <p><strong>Literary:</strong> ${escapeHtml(analysis.context.literary)}</p>

  <h2 style="font-size: 20px; margin-top: 36px; border-bottom: 1px solid #eee; padding-bottom: 6px;">${escapeHtml(verse.original_language)} word study</h2>
  ${wordsHtml}

  <h2 style="font-size: 20px; margin-top: 36px; border-bottom: 1px solid #eee; padding-bottom: 6px;">Cross-references</h2>
  ${xrefsHtml}

  <h2 style="font-size: 20px; margin-top: 36px; border-bottom: 1px solid #eee; padding-bottom: 6px;">Commentary</h2>
  ${commentaryHtml}

  <h2 style="font-size: 20px; margin-top: 36px; border-bottom: 1px solid #eee; padding-bottom: 6px;">Application</h2>
  ${applicationHtml}

  <h2 style="font-size: 20px; margin-top: 36px; border-bottom: 1px solid #eee; padding-bottom: 6px;">Prayer</h2>
  <p style="font-style: italic; border-left: 3px solid #ddd; padding-left: 14px; color: #333;">
    ${escapeHtml(analysis.prayer)}
  </p>

  <p style="margin-top: 48px; font-size: 13px; color: #888; border-top: 1px solid #eee; padding-top: 12px;">
    Daily study &middot; MonkFlow
  </p>
</div>`;
}

function renderEmailText(verse, analysis, date = new Date()) {
  const dateStr = formatLongDate(date);
  const lines = [];
  lines.push(analysis.title);
  lines.push(`${verse.reference} · ${dateStr}`);
  lines.push('');
  lines.push(`"${verse.text}"`);
  lines.push('');
  lines.push(analysis.summary);
  lines.push('');
  lines.push('CONTEXT');
  lines.push(`Historical: ${analysis.context.historical}`);
  lines.push(`Literary:   ${analysis.context.literary}`);
  lines.push('');
  lines.push(`${verse.original_language.toUpperCase()} WORD STUDY`);
  for (const w of analysis.words) {
    lines.push('');
    lines.push(`  ${w.original || ''} (${w.transliteration || ''}${w.strongs ? ' · ' + w.strongs : ''})`);
    lines.push(`  ${w.part_of_speech || ''} · "${w.gloss || ''}"`);
    lines.push(`  ${w.notes || ''}`);
  }
  lines.push('');
  lines.push('CROSS-REFERENCES');
  for (const x of analysis.cross_references) {
    lines.push('');
    lines.push(`  ${x.reference} — ${x.text}`);
    lines.push(`  ${x.connection}`);
  }
  lines.push('');
  lines.push('COMMENTARY');
  lines.push('');
  lines.push(analysis.commentary);
  lines.push('');
  lines.push('APPLICATION');
  lines.push('');
  lines.push(analysis.application);
  lines.push('');
  lines.push('PRAYER');
  lines.push('');
  lines.push(analysis.prayer);
  lines.push('');
  lines.push('---');
  lines.push('Daily study · MonkFlow');
  return lines.join('\n');
}

// ── Main entry point ─────────────────────────────────────────────

async function generateAndSendDailyStudy() {
  const now = new Date();

  // 1. Idempotency guard
  const existing = await query(
    `SELECT id, verse_reference, email_sent_at, email_id, analysis, verse_text
       FROM daily_studies WHERE study_date = CURRENT_DATE`
  );
  let row = existing.rows[0];

  if (row && row.email_sent_at) {
    console.log(`[BibleStudy] Already sent for today (study_id=${row.id}, ref=${row.verse_reference})`);
    return { alreadySent: true, id: row.id, verse_reference: row.verse_reference, email_id: row.email_id };
  }

  // 2. Pick today's verse
  const verse = pickVerse(now);
  console.log(`[BibleStudy] Picked verse: ${verse.reference} (day ${verse.day_of_year})`);

  // 3-4. Generate + store — only if we don't already have a row (retry case)
  let analysis;
  let studyId;
  if (!row) {
    analysis = await generateAnalysis(verse);
    try {
      const ins = await query(
        `INSERT INTO daily_studies (study_date, verse_reference, verse_text, analysis)
         VALUES (CURRENT_DATE, $1, $2, $3)
         RETURNING id`,
        [verse.reference, verse.text, JSON.stringify(analysis)]
      );
      studyId = ins.rows[0].id;
      console.log(`[BibleStudy] Inserted study id=${studyId}`);
    } catch (err) {
      // 23505 = unique_violation — concurrent fire won the race. Use the
      // existing row instead of re-inserting.
      if (err.code === '23505') {
        const { rows } = await query(
          `SELECT id, analysis FROM daily_studies WHERE study_date = CURRENT_DATE`
        );
        studyId = rows[0].id;
        analysis = rows[0].analysis;
        console.log(`[BibleStudy] Race — reusing existing study id=${studyId}`);
      } else {
        throw err;
      }
    }
  } else {
    // Row exists from a previous partial run (Claude succeeded, email failed).
    // Reuse the stored analysis — don't burn tokens re-prompting.
    studyId = row.id;
    analysis = row.analysis;
    console.log(`[BibleStudy] Resuming from existing row id=${studyId} (email send retry)`);
  }

  // 5. Render email
  const html = renderEmailHtml(verse, analysis, now);
  const textBody = renderEmailText(verse, analysis, now);
  const subject = `${analysis.title} — ${verse.reference}`;

  // 6. Send — one send per recipient (not to/cc/bcc together). That way
  // every recipient sees only their own address in the To: header — no
  // cross-leak of subscriber list. `email_id` column stores the tagged
  // list `"recipient1:id1,recipient2:id2"` so a later lookup can tell
  // which Resend message went where.
  const recipients = env.bibleStudyRecipients;
  const sentTags = [];
  const failures = [];
  for (const recipient of recipients) {
    try {
      const sendResult = await emailService.sendEmail({
        to: recipient,
        from: env.emailFrom,
        subject,
        html,
        text: textBody,
      });

      if (sendResult?.error) {
        const msg = sendResult.error.message || JSON.stringify(sendResult.error);
        console.error(`[BibleStudy] Send to ${recipient} failed: ${msg}`);
        failures.push(`${recipient}: ${msg}`);
        continue;
      }

      const id = sendResult?.data?.id || sendResult?.id || null;
      if (id) sentTags.push(`${recipient}:${id}`);
    } catch (err) {
      console.error(`[BibleStudy] Send to ${recipient} threw: ${err.message}`);
      failures.push(`${recipient}: ${err.message}`);
    }
  }

  // If every recipient failed, bubble up so the scheduler heartbeat
  // records the failure and the row stays un-stamped for retry.
  if (sentTags.length === 0) {
    throw new Error(`All recipient sends failed: ${failures.join(' | ')}`);
  }

  // 7. Stamp the row — any successful send counts as "sent today" for
  // idempotency. Failed recipients are logged but don't trigger a
  // second-day resend (by design — partial delivery is better than no
  // delivery, and Resend retries internally for transient failures).
  const emailIdStr = sentTags.join(',');
  await query(
    `UPDATE daily_studies SET email_sent_at = NOW(), email_id = $1, updated_at = NOW() WHERE id = $2`,
    [emailIdStr, studyId]
  );

  if (failures.length > 0) {
    console.warn(`[BibleStudy] Partial send — ${sentTags.length}/${recipients.length} succeeded. Failed: ${failures.join(' | ')}`);
  }

  return {
    id: studyId,
    verse_reference: verse.reference,
    email_id: emailIdStr,
    recipients: recipients.length,
    succeeded: sentTags.length,
    failed: failures.length,
  };
}

module.exports = {
  generateAndSendDailyStudy,
  // exposed for testing / manual inspection:
  pickVerse,
  dayOfYearUTC,
  generateAnalysis,
  renderEmailHtml,
  renderEmailText,
};
