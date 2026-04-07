const cron = require('node-cron');
const { query } = require('../config/database');

let task = null;

async function hb(status, detail) {
  try {
    await query(
      `INSERT INTO scheduler_heartbeats (name, last_run_at, last_status, last_detail, updated_at)
       VALUES ('billing', NOW(), $1, $2, NOW())
       ON CONFLICT (name) DO UPDATE SET last_run_at = NOW(), last_status = $1, last_detail = $2, updated_at = NOW()`,
      [status, detail ? JSON.stringify(detail) : null]
    );
  } catch (_) {}
}

function start() {
  // Run on 1st of each month at 06:00 UTC
  task = cron.schedule('0 6 1 * *', async () => {
    console.log('[BillingScheduler] Running monthly invoice generation...');
    await hb('started', null);
    try {
      const invoiceService = require('./invoice.service');
      const count = await invoiceService.generateAllMonthlyInvoices();
      console.log(`[BillingScheduler] Completed — ${count} invoices generated`);
      await hb('success', { invoices: count });
    } catch (err) {
      console.error('[BillingScheduler] Error:', err.message);
      await hb('failed', { error: err.message });
    }
  }, { timezone: 'UTC' });

  console.log('[BillingScheduler] Started — runs 1st of each month at 06:00 UTC');
}

function stop() {
  if (task) {
    task.stop();
    task = null;
    console.log('[BillingScheduler] Stopped');
  }
}

module.exports = { start, stop };
