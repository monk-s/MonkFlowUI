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
    try {
      const result = await linkedinService.runDailyLinkedInRun();
      console.log('[LINKEDIN] Daily run complete:', JSON.stringify(result.stats));
    } catch (err) {
      console.error('[LINKEDIN] Daily run failed:', err.message);
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
