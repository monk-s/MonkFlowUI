/**
 * Phase 1 data cleanup — zero-reply root-cause plan.
 *
 * Runs the same 4 UPDATEs as scripts/cleanup-bad-leads.sql and prints row counts.
 *
 * Usage:
 *   DATABASE_URL='postgres://...' node scripts/cleanup-bad-leads.js
 *   # or
 *   DATABASE_PUBLIC_URL='postgres://...' node scripts/cleanup-bad-leads.js
 *
 * Safe to re-run. Runs inside a single transaction; rolls back on any error.
 */

const { Pool } = require('pg');

const connectionString =
  process.env.DATABASE_PUBLIC_URL ||
  process.env.DATABASE_URL;

if (!connectionString) {
  console.error('FATAL: set DATABASE_PUBLIC_URL or DATABASE_URL and re-run.');
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: connectionString.includes('railway.internal') ? false : { rejectUnauthorized: false },
});

const ROLE_PREFIX_RE = `^(info|support|contact|admin|office|sales|help|billing|legal|hr|marketing|hello|general|team|directory|reception|inquiries|enquiries|careers|jobs|media|press|service|feedback|accounts|mail|staff)@`;

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1a. Backfill NULL subjects in outreach_emails from outreach_leads
    const r1a = await client.query(
      `UPDATE outreach_emails oe
          SET subject = ol.ai_email_subject
         FROM outreach_leads ol
        WHERE oe.lead_id = ol.id
          AND oe.subject IS NULL
          AND ol.ai_email_subject IS NOT NULL`
    );
    console.log(`[1a] subject backfill: ${r1a.rowCount} outreach_emails rows updated`);

    // 1b. Close role-based email leads
    const r1b = await client.query(
      `UPDATE outreach_leads
          SET status = 'closed', next_followup_at = NULL, updated_at = NOW()
        WHERE status = 'active'
          AND contact_email ~* $1`,
      [ROLE_PREFIX_RE]
    );
    console.log(`[1b] role-based closed: ${r1b.rowCount} outreach_leads rows closed`);

    // 1c. Close leads with garbage contact names
    const r1c = await client.query(
      `UPDATE outreach_leads
          SET status = 'closed', next_followup_at = NULL, updated_at = NOW()
        WHERE status = 'active'
          AND (
                contact_name ~* '(attention|required|allow|discover|opportunities|click here)'
             OR contact_name LIKE '%!%'
             OR contact_name ~* '^(team|staff|admin|office|home)$'
             OR LENGTH(contact_name) > 80
              )`
    );
    console.log(`[1c] garbage names closed: ${r1c.rowCount} outreach_leads rows closed`);

    // 1d. Close leads whose subject is still NULL after 1a
    const r1d = await client.query(
      `UPDATE outreach_leads
          SET status = 'closed', next_followup_at = NULL, updated_at = NOW()
        WHERE status = 'active'
          AND ai_email_subject IS NULL
          AND original_subject IS NULL`
    );
    console.log(`[1d] unrecoverable-null-subject closed: ${r1d.rowCount} outreach_leads rows closed`);

    await client.query('COMMIT');

    // Verification
    const verify = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM outreach_emails WHERE subject IS NULL)                                                     AS null_subject_emails_remaining,
        (SELECT COUNT(*) FROM outreach_leads WHERE status='active' AND contact_email ~* '${ROLE_PREFIX_RE}')             AS active_rolebased_remaining,
        (SELECT COUNT(*) FROM outreach_leads WHERE status='active' AND ai_email_subject IS NULL AND original_subject IS NULL) AS active_nullsubject_remaining,
        (SELECT COUNT(*) FROM outreach_leads WHERE status='active')                                                       AS active_leads_total
    `);
    console.log('\n=== VERIFICATION ===');
    console.table(verify.rows);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('FAILED — rolled back:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
