// LinkedIn outreach cron — fires 9am CT weekdays (1hr after the email cron
// at 8am so they don't compete for Anthropic API + DB connections).
const cron = require('node-cron');
const env = require('../config/env');
const linkedinService = require('./linkedin-outreach.service');

let job = null;

function start() {
  if (!env.linkedinOutreachEnabled) {
    console.log('[LINKEDIN] Disabled (set LINKEDIN_OUTREACH_ENABLED=true to activate)');
    return;
  }
  job = cron.schedule('0 9 * * 1-5', async () => {
    console.log('[LINKEDIN] Cron triggered — running daily LinkedIn outreach...');
    const { query } = require('../config/database');
    // Heartbeat: mark that the cron actually fired, so monitoring can detect
    // silent failures where the tick never runs (vs. runs-and-errors).
    let runId = null;
    try {
      await query(
        `INSERT INTO scheduler_heartbeats (name, last_run_at, last_status, last_detail, updated_at)
         VALUES ('linkedin', NOW(), 'started', NULL, NOW())
         ON CONFLICT (name) DO UPDATE SET last_run_at = NOW(), last_status = 'started', last_detail = NULL, updated_at = NOW()`
      );
    } catch (_) {}
    try { const { rows } = await query(`INSERT INTO scheduler_runs (scheduler_name, status, started_at) VALUES ('linkedin', 'started', NOW()) RETURNING id`); runId = rows[0]?.id; } catch (_) {}
    try {
      const result = await linkedinService.runDailyLinkedInRun();
      const stats = result.stats || {};
      console.log('[LINKEDIN] Daily run complete:', JSON.stringify(stats));
      try {
        await query(
          `UPDATE scheduler_heartbeats SET last_status = 'success', last_detail = $1, updated_at = NOW() WHERE name = 'linkedin'`,
          [JSON.stringify(stats)]
        );
      } catch (_) {}
      if (runId) { try { await query(`UPDATE scheduler_runs SET status='success', detail=$1, finished_at=NOW() WHERE id=$2`, [JSON.stringify(stats), runId]); } catch (_) {} }
    } catch (err) {
      console.error('[LINKEDIN] Daily run failed:', err.message, err.stack);
      const errDetail = JSON.stringify({ error: err.message });
      try {
        await query(
          `UPDATE scheduler_heartbeats SET last_status = 'failed', last_detail = $1, updated_at = NOW() WHERE name = 'linkedin'`,
          [errDetail]
        );
      } catch (_) {}
      if (runId) { try { await query(`UPDATE scheduler_runs SET status='failed', detail=$1, finished_at=NOW() WHERE id=$2`, [errDetail, runId]); } catch (_) {} }
    }
  }, { timezone: 'America/Chicago' });
  console.log('[LINKEDIN] Cron scheduled — weekdays 9am CT');
}

function stop() {
  if (job) {
    job.stop();
    job = null;
    console.log('[LINKEDIN] Cron stopped');
  }
}

module.exports = { start, stop };
