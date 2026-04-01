const cron = require('node-cron');

let task = null;

function start() {
  // Run on 1st of each month at 06:00 UTC
  task = cron.schedule('0 6 1 * *', async () => {
    console.log('[BillingScheduler] Running monthly invoice generation...');
    try {
      const invoiceService = require('./invoice.service');
      const count = await invoiceService.generateAllMonthlyInvoices();
      console.log(`[BillingScheduler] Completed — ${count} invoices generated`);
    } catch (err) {
      console.error('[BillingScheduler] Error:', err.message);
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
