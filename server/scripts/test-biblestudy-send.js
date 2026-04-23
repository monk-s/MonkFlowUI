#!/usr/bin/env node
/**
 * Bible Study E2E Test Send
 *
 * Runs the full Bible study pipeline (pick verse → Claude → render → send)
 * EXCEPT for the DB write. That means:
 *   - Today's scheduled 12:00 UTC cron fire is NOT blocked by this test
 *   - No row in `daily_studies` — the scheduler will still generate the
 *     real email for all configured recipients when the cron ticks
 *
 * Uses production credentials from server/.env.railway (Anthropic + Resend).
 * Sends to a single recipient (default: nate@thelinders.com). Override with:
 *   TEST_RECIPIENT=someone@example.com node server/scripts/test-biblestudy-send.js
 *
 * Run:  node server/scripts/test-biblestudy-send.js
 */

const path = require('path');

// Load production creds from .env.railway (ANTHROPIC_API_KEY, RESEND_API_KEY,
// EMAIL_FROM, etc.). override: true because shell may have empty values set
// that would otherwise block these. Fall through to .env (no override) for
// dev-only values.
require('dotenv').config({ path: path.resolve(__dirname, '../.env.railway'), override: true });
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// Force dev mode so env.js doesn't throw on a non-production DATABASE_URL
process.env.NODE_ENV = 'development';

const svc = require('../src/services/biblestudy.service');
const emailService = require('../src/services/email.service');

const TEST_RECIPIENT = process.env.TEST_RECIPIENT || 'nate@thelinders.com';
const FROM = process.env.EMAIL_FROM || 'noreply@getmonkflow.com';

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Bible Study E2E Test Send');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Recipient: ${TEST_RECIPIENT}`);
  console.log(`  From:      ${FROM}`);
  console.log(`  DB write:  SKIPPED (this is a test — real cron still fires)`);
  console.log('───────────────────────────────────────────────────────────');

  // Sanity: creds present?
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY missing — check .env.railway');
  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY missing — check .env.railway');

  const now = new Date();

  // 1. Pick today's verse
  const verse = svc.pickVerse(now);
  console.log(`[1/4] Picked verse: ${verse.reference} (day ${verse.day_of_year}, ${verse.original_language})`);
  console.log(`      Text: ${verse.text.slice(0, 90)}${verse.text.length > 90 ? '...' : ''}`);

  // 2. Ask Claude
  console.log('[2/4] Calling Claude (this takes ~30-60 seconds)...');
  const t0 = Date.now();
  const analysis = await svc.generateAnalysis(verse);
  const claudeMs = Date.now() - t0;
  console.log(`      Claude returned in ${(claudeMs/1000).toFixed(1)}s`);
  console.log(`      Title: "${analysis.title}"`);
  console.log(`      Words: ${analysis.words.length}, cross-refs: ${analysis.cross_references.length}, commentary: ${analysis.commentary.length} chars`);

  // 3. Render
  const html = svc.renderEmailHtml(verse, analysis, now);
  const text = svc.renderEmailText(verse, analysis, now);
  console.log(`[3/4] Rendered: HTML ${html.length} chars, text ${text.length} chars`);

  // 4. Send (real — Resend production)
  console.log(`[4/4] Sending email to ${TEST_RECIPIENT}...`);
  const subject = `[TEST] ${analysis.title} — ${verse.reference}`;
  const result = await emailService.sendEmail({
    to: TEST_RECIPIENT,
    from: FROM,
    subject,
    html,
    text,
  });

  if (result?.error) {
    throw new Error(`Resend error: ${result.error.message || JSON.stringify(result.error)}`);
  }

  const emailId = result?.data?.id || result?.id || 'unknown';
  console.log('───────────────────────────────────────────────────────────');
  console.log(`  SUCCESS — Resend message id: ${emailId}`);
  console.log(`  Subject: ${subject}`);
  console.log(`  Check inbox: ${TEST_RECIPIENT}`);
  console.log('═══════════════════════════════════════════════════════════');

  process.exit(0);
}

main().catch(err => {
  console.error('─── TEST FAILED ───');
  console.error(err);
  process.exit(1);
});
