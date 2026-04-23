const cron = require('node-cron');
const { query } = require('../config/database');

let task = null;

async function hb(status, detail) {
  try {
    await query(
      `INSERT INTO scheduler_heartbeats (name, last_run_at, last_status, last_detail, updated_at)
       VALUES ('biblestudy', NOW(), $1, $2, NOW())
       ON CONFLICT (name) DO UPDATE SET last_run_at = NOW(), last_status = $1, last_detail = $2, updated_at = NOW()`,
      [status, detail ? JSON.stringify(detail) : null]
    );
  } catch (_) {}
}

function start() {
  // Run daily at 12:00 UTC (= 06:00 AM CT standard, 07:00 AM CT during DST).
  // Delivers the daily study into Nathan's inbox before morning coffee.
  task = cron.schedule('0 12 * * *', async () => {
    console.log('[BibleStudyScheduler] Running daily study generation...');
    await hb('started', null);
    try {
      const svc = require('./biblestudy.service');
      const res = await svc.generateAndSendDailyStudy();
      if (res && res.alreadySent) {
        console.log('[BibleStudyScheduler] Already sent for today — skipping');
        await hb('success', { alreadySent: true });
      } else {
        console.log(`[BibleStudyScheduler] Sent: ${res.verse_reference} (email_id=${res.email_id})`);
        await hb('success', { reference: res.verse_reference, email_id: res.email_id });
      }
    } catch (err) {
      console.error('[BibleStudyScheduler] Error:', err.message);
      await hb('failed', { error: err.message });
    }
  }, { timezone: 'UTC' });

  console.log('[BibleStudyScheduler] Started — runs daily at 12:00 UTC');
}

function stop() {
  if (task) {
    task.stop();
    task = null;
    console.log('[BibleStudyScheduler] Stopped');
  }
}

module.exports = { start, stop };
