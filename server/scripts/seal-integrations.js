/**
 * One-off: seal integration credentials that were stored as plain JSON
 * before models/integration.model.js began encrypting them.
 *
 *   DATABASE_URL=... DOCUMENT_KEY=... node scripts/seal-integrations.js          (dry run: counts only)
 *   DATABASE_URL=... DOCUMENT_KEY=... node scripts/seal-integrations.js --apply
 *
 * Safe to run twice: sealed and empty rows are skipped.
 */
const { query } = require('../src/config/database');
const secretBox = require('../src/utils/secretBox');
const { pack } = require('../src/models/integration.model');

(async () => {
  if (!secretBox.configured()) throw new Error('DOCUMENT_KEY is not set (64 hex characters).');
  const apply = process.argv.includes('--apply');
  const { rows } = await query(`SELECT id, user_id, provider, config FROM user_integrations WHERE config <> '{}'::jsonb AND NOT (config ? '_sealed')`);
  for (const row of rows) {
    if (apply) await query('UPDATE user_integrations SET config = $2 WHERE id = $1', [row.id, JSON.stringify(pack(row.config, row.user_id))]);
    console.log(`${apply ? 'sealed' : 'would seal'}: ${row.provider} (row ${row.id})`);
  }
  console.log(`${rows.length} row(s) ${apply ? 'sealed' : 'to seal. Re-run with --apply.'}`);
  process.exit(0);
})().catch((err) => { console.error(err.message); process.exit(1); });
