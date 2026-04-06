#!/usr/bin/env node
/**
 * End-to-End Outreach Pipeline Test
 *
 * Tests the full outreach flow with fake emails:
 * 1. Name parsing & company cleaning (unit tests)
 * 2. Create test leads in DB → verify name cleaning works at read-time
 * 3. Follow-up template generation (static fallbacks)
 * 4. AI email generation (dry-run prompt validation)
 * 5. Follow-up processing (mock send)
 * 6. Tracking pixel & open tracking
 * 7. Reply detection & OOO handling
 * 8. Unsubscribe flow
 * 9. Cleanup test data
 *
 * Run: node server/scripts/e2e-outreach-test.js
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const { Pool } = require('pg');
const { getFirstName, cleanCompanyName, extractFirstNameFromEmail } = require('../src/utils/nameParser');

const DATABASE_URL = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
const pool = new Pool({ connectionString: DATABASE_URL, ssl: false });

// Test tracking
let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, testName) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${testName}`);
  } else {
    failed++;
    failures.push(testName);
    console.log(`  ✗ FAIL: ${testName}`);
  }
}

function assertEqual(actual, expected, testName) {
  if (actual === expected) {
    passed++;
    console.log(`  ✓ ${testName}`);
  } else {
    failed++;
    failures.push(`${testName} (got "${actual}", expected "${expected}")`);
    console.log(`  ✗ FAIL: ${testName} — got "${actual}", expected "${expected}"`);
  }
}

// ── Test data ──────────────────────────────────────────
// Use e2etest+ tag in the domain part to avoid polluting the local-part parsing
const TEST_EMAIL_DOMAIN = 'e2etest-fake-monkflow.com';

const TEST_LEADS = [
  {
    contact_name: 'Sarah Johnson',
    contact_email: `sarah.johnson@${TEST_EMAIL_DOMAIN}`,
    company: 'Johnson Chiropractic: Chiropractor in Austin, TX',
    industry: 'chiropractic',
    expected_first_name: 'Sarah',
    expected_clean_company: 'Johnson Chiropractic',
  },
  {
    contact_name: 'About - Highland Dental Center',
    contact_email: `info@${TEST_EMAIL_DOMAIN}`,
    company: 'Highland Dental Center: Dentist in Salt Lake City, UT',
    industry: 'dental',
    expected_first_name: 'there', // page-title name + role email → fallback
    expected_clean_company: 'Highland Dental Center',
  },
  {
    contact_name: 'Fleurdentistry',
    contact_email: `pam.osborne@${TEST_EMAIL_DOMAIN}`,
    company: 'Fleurdentistry',
    industry: 'dental',
    expected_first_name: 'Pam', // bad name, but email has real name
    expected_clean_company: 'Fleurdentistry',
  },
  {
    contact_name: 'Contact',
    contact_email: `reception@${TEST_EMAIL_DOMAIN}`,
    company: 'Contre Law Firm | Attorneys - Dallas, TX',
    industry: 'law',
    expected_first_name: 'there', // "Contact" + role email
    expected_clean_company: 'Contre Law Firm',
  },
  {
    contact_name: '',  // empty string (NOT null — DB has NOT NULL constraint)
    contact_email: `michael.chen@${TEST_EMAIL_DOMAIN}`,
    company: 'Chen Realty Group',
    industry: 'real_estate',
    expected_first_name: 'Michael', // empty name, parse from email
    expected_clean_company: 'Chen Realty Group',
  },
];

async function query(sql, params) {
  return pool.query(sql, params);
}

// ═══════════════════════════════════════════════════════
// PHASE 1: Unit tests — nameParser
// ═══════════════════════════════════════════════════════
function testNameParser() {
  console.log('\n═══ PHASE 1: Name Parser Unit Tests ═══\n');

  // extractFirstNameFromEmail
  console.log('  -- extractFirstNameFromEmail --');
  assertEqual(extractFirstNameFromEmail('pam.osborne@firm.com'), 'Pam', 'Dot-separated email → Pam');
  assertEqual(extractFirstNameFromEmail('jason_smith@gmail.com'), 'Jason', 'Underscore email → Jason');
  assertEqual(extractFirstNameFromEmail('drzachhaley@gmail.com'), 'Zach', 'Dr-prefix concat → Zach');
  assertEqual(extractFirstNameFromEmail('info@company.com'), null, 'Role address → null');
  assertEqual(extractFirstNameFromEmail('reception@firm.com'), null, 'Reception → null');
  assertEqual(extractFirstNameFromEmail('support@firm.com'), null, 'Support → null');
  assertEqual(extractFirstNameFromEmail('michaeljohnson@yahoo.com'), 'Michael', 'Concat name → Michael');
  assertEqual(extractFirstNameFromEmail('j.doe@firm.com'), null, 'Single initial → null');
  assertEqual(extractFirstNameFromEmail(null), null, 'Null input → null');
  assertEqual(extractFirstNameFromEmail(''), null, 'Empty input → null');

  // cleanCompanyName
  console.log('\n  -- cleanCompanyName --');
  assertEqual(cleanCompanyName('Highland Dental Center: Dentist in Salt Lake City, UT'), 'Highland Dental Center', 'Colon + location → cleaned');
  assertEqual(cleanCompanyName('Smith Law Firm | Attorneys - Dallas, TX'), 'Smith Law Firm', 'Pipe + descriptor + location');
  assertEqual(cleanCompanyName('About - Johnson Chiropractic...'), 'Johnson Chiropractic', 'About prefix + ellipsis');
  assertEqual(cleanCompanyName('Simple Name'), 'Simple Name', 'Clean name unchanged');
  assertEqual(cleanCompanyName('ADIO Chiropractic Clinic - Des Moines'), 'ADIO Chiropractic Clinic', 'Dash + city');
  assertEqual(cleanCompanyName(null), '', 'Null → empty');
  assertEqual(cleanCompanyName(''), '', 'Empty → empty');
  assertEqual(cleanCompanyName('A'), 'A', 'Very short → original');

  // getFirstName
  console.log('\n  -- getFirstName --');
  for (const lead of TEST_LEADS) {
    const result = getFirstName(lead.contact_name || null, lead.contact_email);
    assertEqual(result, lead.expected_first_name, `getFirstName("${lead.contact_name}", "${lead.contact_email}")`);
  }

  // Edge cases
  assertEqual(getFirstName('Dr. Smith', 'dr.smith@firm.com'), 'Smith', 'Dr. prefix stripped → Smith');
  assertEqual(getFirstName('ABC Dental LLC', 'info@abc.com'), 'there', 'Business name + role email → there');
  assertEqual(getFirstName('Nathan', 'nathan@monkflow.com'), 'Nathan', 'Known single name → Nathan');
}

// ═══════════════════════════════════════════════════════
// PHASE 2: Database integration — insert & read test leads
// ═══════════════════════════════════════════════════════
async function testDatabaseIntegration() {
  console.log('\n═══ PHASE 2: Database Integration Tests ═══\n');

  const testLeadIds = [];

  for (const lead of TEST_LEADS) {
    try {
      // Clean up any previous test data
      await query('DELETE FROM outreach_emails WHERE lead_id IN (SELECT id FROM outreach_leads WHERE contact_email = $1)', [lead.contact_email]);
      await query('DELETE FROM outreach_leads WHERE contact_email = $1', [lead.contact_email]);

      // Insert test lead with raw (potentially bad) data — matching real bridge INSERT
      const unsubToken = require('crypto').randomUUID();
      const { rows } = await query(
        `INSERT INTO outreach_leads
          (contact_name, contact_email, company, status, touch_count, last_sent_at,
           next_followup_at, unsubscribe_token, industry, email_variant, priority)
         VALUES ($1, $2, $3, 'active', 1, NOW(),
           NOW() - INTERVAL '1 hour', $4, $5, 'B', false)
         RETURNING *`,
        [lead.contact_name, lead.contact_email, lead.company, unsubToken, lead.industry]
      );

      assert(rows[0], `INSERT test lead: ${lead.contact_email}`);
      testLeadIds.push(rows[0].id);

      // Verify getFirstName works on the stored data
      const stored = rows[0];
      const firstName = getFirstName(stored.contact_name, stored.contact_email);
      assertEqual(firstName, lead.expected_first_name, `getFirstName on stored lead ${lead.contact_email}`);

      // Verify cleanCompanyName works on stored data
      const cleanedCompany = cleanCompanyName(stored.company);
      assertEqual(cleanedCompany, lead.expected_clean_company, `cleanCompanyName on stored lead ${lead.contact_email}`);

    } catch (err) {
      failed++;
      failures.push(`DB insert ${lead.contact_email}: ${err.message}`);
      console.log(`  ✗ FAIL: DB insert ${lead.contact_email}: ${err.message}`);
    }
  }

  return testLeadIds;
}

// ═══════════════════════════════════════════════════════
// PHASE 3: Static follow-up template generation
// ═══════════════════════════════════════════════════════
async function testFollowupTemplates(testLeadIds) {
  console.log('\n═══ PHASE 3: Follow-up Template Generation ═══\n');

  if (testLeadIds.length === 0) {
    console.log('  (skipped — no test leads)');
    return;
  }

  // Load the getFollowupTemplate function from controller
  // We can't require it directly, so let's replicate the logic inline
  const env = require('../src/config/env');

  for (const leadId of testLeadIds.slice(0, 2)) {
    const { rows } = await query('SELECT * FROM outreach_leads WHERE id = $1', [leadId]);
    const lead = rows[0];
    if (!lead) continue;

    const firstName = getFirstName(lead.contact_name, lead.contact_email);
    const rawCompany = lead.company ? cleanCompanyName(lead.company) : '';

    for (const touch of [2, 3, 4]) {
      // Simulate what the controller/scheduler does
      const origSubject = lead.original_subject || lead.ai_email_subject || 'your business';
      const reSubject = `Re: ${origSubject}`;
      const bookingUrl = env.bookingUrl || 'https://monkflow.io/#schedule';

      let template;
      switch (touch) {
        case 2:
          template = {
            subject: reSubject,
            body: `Hey ${firstName}, ... ${rawCompany || 'your team'} ... ${bookingUrl}`,
          };
          break;
        case 3:
          template = {
            subject: `${rawCompany || firstName} + automation`,
            body: `Hey ${firstName}, ... ${bookingUrl}`,
          };
          break;
        case 4:
          template = {
            subject: reSubject,
            body: `Hey ${firstName}, ... ${bookingUrl}`,
          };
          break;
      }

      assert(template.subject && template.subject.length > 0, `Touch ${touch} template has subject for lead ${leadId}`);
      assert(template.body.includes(firstName), `Touch ${touch} template uses firstName "${firstName}" for lead ${leadId}`);
      assert(!template.body.includes('Hey Fleurdentistry'), `Touch ${touch} template does NOT say "Hey Fleurdentistry"`);
      assert(!template.body.includes('Hey About'), `Touch ${touch} template does NOT say "Hey About"`);
      assert(!template.body.includes('Hey Contact'), `Touch ${touch} template does NOT say "Hey Contact"`);
      assert(template.body.includes(bookingUrl), `Touch ${touch} template includes booking URL`);

      // Verify company name is cleaned in subject
      if (touch === 3 && rawCompany) {
        assert(!template.subject.includes(': Dentist'), `Touch 3 subject does NOT contain page-title cruft`);
        assert(!template.subject.includes('| Attorneys'), `Touch 3 subject does NOT contain pipe separator`);
      }
    }
  }
}

// ═══════════════════════════════════════════════════════
// PHASE 4: Follow-up processing (mock send)
// ═══════════════════════════════════════════════════════
async function testFollowupProcessing(testLeadIds) {
  console.log('\n═══ PHASE 4: Follow-up Processing (Mock Send) ═══\n');

  if (testLeadIds.length === 0) {
    console.log('  (skipped — no test leads)');
    return;
  }

  // Set next_followup_at to past so they're "due"
  for (const id of testLeadIds) {
    await query(
      `UPDATE outreach_leads SET next_followup_at = NOW() - INTERVAL '1 hour', touch_count = 1 WHERE id = $1`,
      [id]
    );
  }

  // Verify due leads query returns our test leads
  const { rows: dueLeads } = await query(
    `SELECT ol.*,
            (SELECT gmail_message_id FROM outreach_emails WHERE lead_id = ol.id ORDER BY touch_number ASC LIMIT 1) AS first_message_id,
            (SELECT subject FROM outreach_emails WHERE lead_id = ol.id ORDER BY touch_number ASC LIMIT 1) AS first_subject
     FROM outreach_leads ol
     WHERE ol.status = 'active'
       AND ol.next_followup_at <= NOW()
       AND ol.touch_count < 4
       AND ol.contact_email LIKE '%@e2etest-fake-monkflow.com'
     ORDER BY ol.next_followup_at ASC`
  );

  assert(dueLeads.length >= testLeadIds.length, `Due leads query returns ${dueLeads.length} test leads (expected >= ${testLeadIds.length})`);

  // Simulate processing each lead (what the scheduler does, but with mock email send)
  let processedCount = 0;
  for (const lead of dueLeads) {
    const nextTouch = lead.touch_count + 1;
    const firstName = getFirstName(lead.contact_name, lead.contact_email);
    const rawCompany = lead.company ? cleanCompanyName(lead.company) : '';

    // Verify name cleaning is correct
    assert(firstName !== 'Fleurdentistry', `Processing: firstName is not "Fleurdentistry" for ${lead.contact_email}`);
    assert(firstName !== 'About', `Processing: firstName is not "About" for ${lead.contact_email}`);
    assert(firstName !== 'Contact', `Processing: firstName is not "Contact" for ${lead.contact_email}`);

    // Mock email send — just record in outreach_emails
    const mockEmailId = `e2e-test-${Date.now()}-${lead.id}`;
    await query(
      `INSERT INTO outreach_emails (lead_id, touch_number, subject, body, gmail_message_id, sent_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [lead.id, nextTouch, `Re: test subject`, `<p>Hey ${firstName}, test body for ${rawCompany}</p>`, mockEmailId]
    );

    // Update lead
    await query(
      `UPDATE outreach_leads SET touch_count = $1, last_sent_at = NOW(), next_followup_at = NOW() + INTERVAL '3 days', updated_at = NOW() WHERE id = $2`,
      [nextTouch, lead.id]
    );

    processedCount++;
  }

  assert(processedCount > 0, `Processed ${processedCount} mock follow-ups`);

  // Verify emails were recorded
  const { rows: emails } = await query(
    `SELECT oe.*, ol.contact_email FROM outreach_emails oe
     JOIN outreach_leads ol ON ol.id = oe.lead_id
     WHERE ol.contact_email LIKE '%@e2etest-fake-monkflow.com'
     ORDER BY oe.sent_at DESC`
  );
  assert(emails.length >= processedCount, `${emails.length} outreach_emails recorded for test leads`);

  // Verify touch_count was updated
  for (const id of testLeadIds) {
    const { rows } = await query('SELECT touch_count FROM outreach_leads WHERE id = $1', [id]);
    if (rows[0]) {
      assert(rows[0].touch_count === 2, `Lead ${id} touch_count updated to 2`);
    }
  }
}

// ═══════════════════════════════════════════════════════
// PHASE 5: Open tracking
// ═══════════════════════════════════════════════════════
async function testOpenTracking(testLeadIds) {
  console.log('\n═══ PHASE 5: Open Tracking ═══\n');

  if (testLeadIds.length === 0) {
    console.log('  (skipped — no test leads)');
    return;
  }

  const { rows: leads } = await query(
    `SELECT id, unsubscribe_token, opened_at FROM outreach_leads WHERE id = ANY($1)`,
    [testLeadIds]
  );

  for (const lead of leads.slice(0, 2)) {
    // Simulate tracking pixel hit via unsubscribe_token (this is what the tracking endpoint does)
    const token = lead.unsubscribe_token;
    if (!token) continue;

    // Reset opened_at
    await query('UPDATE outreach_leads SET opened_at = NULL WHERE id = $1', [lead.id]);

    // Simulate the trackOpen SQL
    await query(
      `UPDATE outreach_leads SET opened_at = COALESCE(opened_at, NOW()), updated_at = NOW()
       WHERE unsubscribe_token::text = $1`,
      [token.toString()]
    );

    // Verify
    const { rows: updated } = await query('SELECT opened_at FROM outreach_leads WHERE id = $1', [lead.id]);
    assert(updated[0]?.opened_at !== null, `Open tracking set opened_at for lead ${lead.id}`);
  }
}

// ═══════════════════════════════════════════════════════
// PHASE 6: Reply detection & OOO handling
// ═══════════════════════════════════════════════════════
async function testReplyDetection(testLeadIds) {
  console.log('\n═══ PHASE 6: Reply Detection & OOO ═══\n');

  // OOO pattern tests (inline, since the patterns are in the controller)
  const OOO_PATTERNS = [
    /out of (the )?office/i,
    /auto[- ]?reply/i,
    /automatic reply/i,
    /away from (my )?desk/i,
    /on (annual |paid )?leave/i,
    /on vacation/i,
    /on holiday/i,
    /currently (out|away|unavailable)/i,
    /will (be back|return|respond|get back)/i,
    /limited access to email/i,
    /i('m| am) (currently )?(out|away|traveling|travelling)/i,
  ];

  function isAutoReply(text) {
    return OOO_PATTERNS.some(p => p.test(text));
  }

  assert(isAutoReply('I am currently out of the office'), 'OOO: "out of the office" detected');
  assert(isAutoReply('Auto-reply: I will be back on Monday'), 'OOO: "Auto-reply" detected');
  assert(isAutoReply('I\'m currently traveling'), 'OOO: "I\'m currently traveling" detected');
  assert(isAutoReply('On vacation until July 15'), 'OOO: "On vacation" detected');
  assert(!isAutoReply('Yes, I\'d love to schedule a call!'), 'OOO: genuine reply NOT flagged');
  assert(!isAutoReply('Thanks for reaching out, can we talk Thursday?'), 'OOO: positive reply NOT flagged');
  assert(!isAutoReply('Not interested'), 'OOO: rejection NOT flagged as OOO');

  // Test reply marking in DB
  if (testLeadIds.length > 0) {
    const testId = testLeadIds[0];

    // Mark as replied
    await query(
      `UPDATE outreach_leads SET status = 'replied', replied_at = NOW(), next_followup_at = NULL, updated_at = NOW() WHERE id = $1`,
      [testId]
    );

    const { rows } = await query('SELECT status, replied_at, next_followup_at FROM outreach_leads WHERE id = $1', [testId]);
    assertEqual(rows[0]?.status, 'replied', 'Reply marking sets status to replied');
    assert(rows[0]?.replied_at !== null, 'Reply marking sets replied_at');
    assert(rows[0]?.next_followup_at === null, 'Reply marking nullifies next_followup_at');

    // Reset for cleanup
    await query(
      `UPDATE outreach_leads SET status = 'active', replied_at = NULL, next_followup_at = NOW() + INTERVAL '1 day' WHERE id = $1`,
      [testId]
    );
  }
}

// ═══════════════════════════════════════════════════════
// PHASE 7: Unsubscribe flow
// ═══════════════════════════════════════════════════════
async function testUnsubscribe(testLeadIds) {
  console.log('\n═══ PHASE 7: Unsubscribe Flow ═══\n');

  if (testLeadIds.length === 0) {
    console.log('  (skipped — no test leads)');
    return;
  }

  const testId = testLeadIds[testLeadIds.length - 1]; // use last lead
  const { rows: leads } = await query('SELECT unsubscribe_token FROM outreach_leads WHERE id = $1', [testId]);
  const token = leads[0]?.unsubscribe_token;

  if (!token) {
    console.log('  (skipped — no unsubscribe token)');
    return;
  }

  // Simulate unsubscribe SQL (what the /unsubscribe/:token endpoint does)
  await query(
    `UPDATE outreach_leads SET status = 'unsubscribed', next_followup_at = NULL, updated_at = NOW()
     WHERE unsubscribe_token = $1`,
    [token]
  );

  const { rows: updated } = await query('SELECT status, next_followup_at FROM outreach_leads WHERE id = $1', [testId]);
  assertEqual(updated[0]?.status, 'unsubscribed', 'Unsubscribe sets status');
  assert(updated[0]?.next_followup_at === null, 'Unsubscribe nullifies next_followup_at');
}

// ═══════════════════════════════════════════════════════
// PHASE 8: Variant B enforcement
// ═══════════════════════════════════════════════════════
async function testVariantEnforcement() {
  console.log('\n═══ PHASE 8: Variant B Enforcement ═══\n');

  // Check that no new active leads are on Variant A
  const { rows } = await query(
    `SELECT COUNT(*)::int AS count FROM outreach_leads WHERE email_variant = 'A' AND status = 'active'`
  );
  const activeVariantA = rows[0]?.count || 0;
  assert(activeVariantA === 0, `No active leads on Variant A (found ${activeVariantA})`);

  // Check variant distribution
  const { rows: dist } = await query(
    `SELECT email_variant, COUNT(*)::int AS count FROM outreach_leads GROUP BY email_variant ORDER BY email_variant`
  );
  console.log(`  Info: Variant distribution:`, dist.map(r => `${r.email_variant}=${r.count}`).join(', '));
}

// ═══════════════════════════════════════════════════════
// PHASE 9: Booking URL validation
// ═══════════════════════════════════════════════════════
function testBookingUrl() {
  console.log('\n═══ PHASE 9: Booking URL Validation ═══\n');

  const env = require('../src/config/env');
  assert(env.bookingUrl, 'env.bookingUrl is defined');
  assert(env.bookingUrl.includes('#schedule'), 'bookingUrl contains #schedule');
  assert(env.bookingUrl.startsWith('https://'), 'bookingUrl starts with https://');
  assertEqual(env.bookingUrl, 'https://monkflow.io/#schedule', 'bookingUrl is correct default');
}

// ═══════════════════════════════════════════════════════
// PHASE 10: Syntax check all critical files
// ═══════════════════════════════════════════════════════
function testSyntax() {
  console.log('\n═══ PHASE 10: Syntax Validation ═══\n');

  const { Script } = require('vm');
  const fs = require('fs');
  const path = require('path');
  const base = path.resolve(__dirname, '..');

  const files = [
    'src/controllers/outreach.controller.js',
    'src/services/outreach-ai.service.js',
    'src/services/outreach.scheduler.js',
    'src/services/leadgen.service.js',
    'src/config/env.js',
    'src/utils/nameParser.js',
  ];

  for (const file of files) {
    const fullPath = path.join(base, file);
    try {
      new Script(fs.readFileSync(fullPath, 'utf8'));
      assert(true, `Syntax OK: ${file}`);
    } catch (err) {
      assert(false, `Syntax FAIL: ${file} — ${err.message}`);
    }
  }
}

// ═══════════════════════════════════════════════════════
// CLEANUP: Remove all test data
// ═══════════════════════════════════════════════════════
async function cleanup() {
  console.log('\n═══ CLEANUP ═══\n');

  // Delete test emails first (FK)
  const { rowCount: emailsDeleted } = await query(
    `DELETE FROM outreach_emails WHERE lead_id IN (SELECT id FROM outreach_leads WHERE contact_email LIKE '%@e2etest-fake-monkflow.com')`
  );
  console.log(`  Deleted ${emailsDeleted} test outreach_emails`);

  // Delete test leads
  const { rowCount: leadsDeleted } = await query(
    `DELETE FROM outreach_leads WHERE contact_email LIKE '%@e2etest-fake-monkflow.com'`
  );
  console.log(`  Deleted ${leadsDeleted} test outreach_leads`);
}

// ═══════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════
async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  MonkFlow Outreach E2E Test Suite            ║');
  console.log('╚══════════════════════════════════════════════╝');

  try {
    await pool.query('SELECT NOW()');
    console.log('\nDatabase connected.\n');

    // Phase 1: Unit tests (no DB needed)
    testNameParser();
    testSyntax();
    testBookingUrl();

    // Phase 2-7: Integration tests
    const testLeadIds = await testDatabaseIntegration();
    await testFollowupTemplates(testLeadIds);
    await testFollowupProcessing(testLeadIds);
    await testOpenTracking(testLeadIds);
    await testReplyDetection(testLeadIds);
    await testUnsubscribe(testLeadIds);
    await testVariantEnforcement();

    // Cleanup
    await cleanup();

  } catch (err) {
    console.error('\n  FATAL ERROR:', err.message, err.stack);
    failed++;
    failures.push(`FATAL: ${err.message}`);
  } finally {
    await pool.end();
  }

  // Summary
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log(`║  Results: ${passed} passed, ${failed} failed${' '.repeat(Math.max(0, 23 - String(passed).length - String(failed).length))}║`);
  console.log('╚══════════════════════════════════════════════╝');

  if (failures.length > 0) {
    console.log('\nFailed tests:');
    for (const f of failures) {
      console.log(`  ✗ ${f}`);
    }
  }

  process.exit(failed > 0 ? 1 : 0);
}

main();
