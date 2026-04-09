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
        `INSERT INTO scheduler_heartbeats (name, last_run_at, last_status, last_detail, updated_at)
         VALUES ('leadgen', NOW(), 'started', NULL, NOW())
         ON CONFLICT (name) DO UPDATE SET last_run_at = NOW(), last_status = 'started', last_detail = NULL, updated_at = NOW()`
      );
    } catch (_) {}
    try {
      // Global 30-min watchdog — if anything hangs silently, this forces failure
      // so the heartbeat flips to 'failed' instead of stuck on 'started' forever.
      const stats = await Promise.race([
        runDailyLeadGeneration(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('runDailyLeadGeneration timeout after 45min')), 45 * 60 * 1000)),
      ]);
      console.log('[LEADGEN] Daily run complete:', stats);

      // Reconcile: backfill any outreach_leads sends that weren't mirrored
      // into outreach_emails (safety net so dashboard analytics never miss data)
      try {
        const r = await query(`
          INSERT INTO outreach_emails (lead_id, touch_number, subject, body, gmail_message_id, variant, sent_at, delivered_at, opened_at)
          SELECT ol.id, 0, ol.ai_email_subject, ol.original_email_body, ol.original_message_id, ol.email_variant, ol.last_sent_at, COALESCE(ol.last_sent_at, NOW()), ol.opened_at
          FROM outreach_leads ol
          WHERE ol.last_sent_at >= NOW() - INTERVAL '2 days'
            AND ol.touch_count >= 1
            AND NOT EXISTS (SELECT 1 FROM outreach_emails oe WHERE oe.lead_id = ol.id AND oe.touch_number = 0)
        `);
        if (r.rowCount > 0) console.log(`[LEADGEN] Reconciled ${r.rowCount} missing outreach_emails rows`);
        stats.reconciled = r.rowCount;
      } catch (recErr) {
        console.warn('[LEADGEN] Reconcile failed:', recErr.message);
      }

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
