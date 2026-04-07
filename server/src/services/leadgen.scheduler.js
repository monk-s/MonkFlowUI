const cron = require('node-cron');

let job = null;

function start() {
  if (process.env.LEADGEN_ENABLED !== 'true') {
    console.log('[LEADGEN] Disabled (set LEADGEN_ENABLED=true to activate)');
    return;
  }

  const { runDailyLeadGeneration } = require('./leadgen.service');

  // 8:00 AM Central Time, weekdays only (Mon-Fri)
  job = cron.schedule('0 8 * * 1-5', async () => {
    console.log('[LEADGEN] Cron triggered — starting daily run...');
    const { query } = require('../config/database');
    // Heartbeat: mark that the cron actually fired (before run, in case run errors)
    try {
      await query(
        `INSERT INTO scheduler_heartbeats (name, last_run_at, last_status, updated_at)
         VALUES ('leadgen', NOW(), 'started', NOW())
         ON CONFLICT (name) DO UPDATE SET last_run_at = NOW(), last_status = 'started', updated_at = NOW()`
      );
    } catch (_) {}
    try {
      const stats = await runDailyLeadGeneration();
      console.log('[LEADGEN] Daily run complete:', stats);
      try {
        await query(
          `UPDATE scheduler_heartbeats SET last_status = 'success', last_detail = $1, updated_at = NOW() WHERE name = 'leadgen'`,
          [JSON.stringify(stats)]
        );
      } catch (_) {}
    } catch (err) {
      console.error('[LEADGEN] Daily run FAILED:', err.message, err.stack);
      try {
        await query(
          `UPDATE scheduler_heartbeats SET last_status = 'failed', last_detail = $1, updated_at = NOW() WHERE name = 'leadgen'`,
          [JSON.stringify({ error: err.message })]
        );
      } catch (_) {}
    }
  }, { timezone: 'America/Chicago' });

  console.log('[LEADGEN] Cron scheduled — weekdays at 8:00 AM CT');
}

function stop() {
  if (job) {
    job.stop();
    job = null;
    console.log('[LEADGEN] Cron stopped');
  }
}

module.exports = { start, stop };
