/**
 * Remove someone's second factor (lost phone). They set up a new one at
 * their next sign-in, and every open session of theirs ends.
 *
 *   DATABASE_URL=... node scripts/reset-mfa.js person@example.com
 */
const { query } = require('../src/config/database');
const sessions = require('../src/services/session.service');

(async () => {
  const email = process.argv[2];
  if (!email) throw new Error('Usage: node scripts/reset-mfa.js <email>');
  const { rows } = await query(
    `UPDATE users SET mfa_secret = NULL, mfa_pending_secret = NULL, mfa_last_step = NULL, mfa_enrolled_at = NULL
     WHERE lower(email) = lower($1) RETURNING id`, [email]);
  if (!rows.length) throw new Error(`No account for ${email}`);
  await sessions.revokeAllForUser(rows[0].id);
  console.log(`Second factor removed for ${email}. Open sessions ended.`);
  process.exit(0);
})().catch((err) => { console.error(err.message); process.exit(1); });
