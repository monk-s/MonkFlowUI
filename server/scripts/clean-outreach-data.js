#!/usr/bin/env node
/**
 * One-time data cleanup script for outreach_leads.
 *
 * Fixes:
 * 1. Cleans company names (strips page-title cruft)
 * 2. Flips all active Variant A leads to Variant B
 *
 * Run: node server/scripts/clean-outreach-data.js
 *
 * Note: contact_name is NOT updated in DB — the getFirstName() utility
 * handles name cleaning at read-time, so raw data is preserved.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const { Pool } = require('pg');
const { cleanCompanyName } = require('../src/utils/nameParser');

const DATABASE_URL = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('ERROR: No DATABASE_URL or DATABASE_PUBLIC_URL found in environment');
  process.exit(1);
}

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL, ssl: false });

  try {
    console.log('[CLEANUP] Connecting to database...');
    await pool.query('SELECT NOW()');
    console.log('[CLEANUP] Connected.\n');

    // 1. Clean company names
    console.log('[CLEANUP] Phase 1: Cleaning company names...');
    const { rows: leads } = await pool.query('SELECT id, company FROM outreach_leads WHERE company IS NOT NULL');

    let companiesCleaned = 0;
    for (const lead of leads) {
      const cleaned = cleanCompanyName(lead.company);
      if (cleaned !== lead.company.trim() && cleaned.length > 0) {
        await pool.query('UPDATE outreach_leads SET company = $1, updated_at = NOW() WHERE id = $2', [cleaned, lead.id]);
        companiesCleaned++;
        if (companiesCleaned <= 10) {
          console.log(`  "${lead.company}" → "${cleaned}"`);
        }
      }
    }
    console.log(`[CLEANUP] Companies cleaned: ${companiesCleaned} / ${leads.length}\n`);

    // 2. Flip active Variant A leads to Variant B
    console.log('[CLEANUP] Phase 2: Flipping Variant A → B...');
    const { rowCount: flipped } = await pool.query(
      `UPDATE outreach_leads SET email_variant = 'B', updated_at = NOW() WHERE email_variant = 'A' AND status = 'active'`
    );
    console.log(`[CLEANUP] Variant A → B: ${flipped} leads flipped\n`);

    // 3. Summary stats
    const { rows: stats } = await pool.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE email_variant = 'A') AS variant_a,
        COUNT(*) FILTER (WHERE email_variant = 'B') AS variant_b,
        COUNT(*) FILTER (WHERE status = 'active') AS active
      FROM outreach_leads
    `);
    console.log('[CLEANUP] Final stats:', stats[0]);
    console.log('\n[CLEANUP] Done!');

  } catch (err) {
    console.error('[CLEANUP] ERROR:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
