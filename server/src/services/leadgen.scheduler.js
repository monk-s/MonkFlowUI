const cron = require('node-cron');

let job = null;

function start() {
  if (process.env.LEADGEN_ENABLED !== 'true') {
    console.log('[LEADGEN] Disabled (set LEADGEN_ENABLED=true to activate)');
    return;
  }

  const { runDailyLeadGeneration } = require('./leadgen.service');

  // 9:00 AM Central Time, weekdays only (Mon-Fri)
  job = cron.schedule('0 9 * * 1-5', async () => {
    console.log('[LEADGEN] Cron triggered — starting daily run...');
    try {
      const stats = await runDailyLeadGeneration();
      console.log('[LEADGEN] Daily run complete:', stats);
    } catch (err) {
      console.error('[LEADGEN] Daily run FAILED:', err.message, err.stack);
    }
  }, { timezone: 'America/Chicago' });

  console.log('[LEADGEN] Cron scheduled — weekdays at 9:00 AM CT');
}

function stop() {
  if (job) {
    job.stop();
    job = null;
    console.log('[LEADGEN] Cron stopped');
  }
}

module.exports = { start, stop };
