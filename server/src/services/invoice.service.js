const { query } = require('../config/database');
const invoiceModel = require('../models/invoice.model');
const qboModel = require('../models/qbo.model');
const qboService = require('./quickbooks.service');

async function generateMonthlyInvoice(userId, periodStart, periodEnd) {
  // Get user info with plan
  const { rows: userRows } = await query(
    `SELECT u.*, p.slug as plan_slug, p.name as plan_name, p.price_cents,
            p.monthly_workflow_runs as plan_run_limit, p.monthly_agent_tasks as plan_task_limit,
            p.overage_run_cents, p.overage_task_cents
     FROM users u LEFT JOIN plans p ON u.plan_id = p.id
     WHERE u.id = $1`,
    [userId]
  );
  const user = userRows[0];
  if (!user) throw new Error(`User ${userId} not found`);

  // Get usage for the period (check overage records or current counters)
  const { rows: overageRows } = await query(
    `SELECT * FROM usage_overages WHERE user_id = $1 AND period_start = $2`,
    [userId, periodStart]
  );
  const overage = overageRows[0];

  const planAmountCents = user.price_cents || 0;
  const overageRuns = overage ? overage.overage_workflow_runs : Math.max(0, (user.monthly_workflow_runs || 0) - (user.plan_run_limit || 0));
  const overageTasks = overage ? overage.overage_agent_tasks : Math.max(0, (user.monthly_agent_tasks || 0) - (user.plan_task_limit || 0));
  const overageRunCost = overageRuns * (user.overage_run_cents || 50);
  const overageTaskCost = overageTasks * (user.overage_task_cents || 30);
  const overageAmountCents = overageRunCost + overageTaskCost;
  const totalAmountCents = planAmountCents + overageAmountCents;

  // Build line items
  const lineItems = [];
  if (planAmountCents > 0) {
    lineItems.push({
      description: `${user.plan_name || 'Pro'} Plan — Monthly Subscription`,
      amount: planAmountCents,
    });
  }
  if (overageRuns > 0) {
    lineItems.push({
      description: `Overage: ${overageRuns} additional workflow runs @ $${(user.overage_run_cents || 50) / 100}/run`,
      amount: overageRunCost,
    });
  }
  if (overageTasks > 0) {
    lineItems.push({
      description: `Overage: ${overageTasks} additional agent tasks @ $${(user.overage_task_cents || 30) / 100}/task`,
      amount: overageTaskCost,
    });
  }

  // Create invoice record
  const invoice = await invoiceModel.create({
    userId,
    periodStart,
    periodEnd,
    planSlug: user.plan_slug,
    planAmountCents,
    overageAmountCents,
    totalAmountCents,
    lineItems,
    status: 'draft',
  });

  // Sync to QBO if connected
  try {
    const connection = await qboModel.findConnection(userId);
    if (connection) {
      const accessToken = await qboService.ensureValidToken(connection);
      const customerMap = await qboModel.findCustomerMap(userId);

      if (customerMap) {
        const qboInvoice = await qboService.createInvoice(accessToken, connection.realm_id, {
          customerRef: customerMap.qbo_customer_id,
          lineItems,
          emailTo: user.email,
        });

        await invoiceModel.update(invoice.id, {
          qbo_invoice_id: qboInvoice.Id,
          qbo_synced: true,
        });

        console.log(`[InvoiceService] Created QBO invoice ${qboInvoice.Id} for user ${userId}`);
      }
    }
  } catch (err) {
    console.error(`[InvoiceService] QBO sync failed for invoice ${invoice.id}:`, err.message);
    // Non-fatal — invoice is still created locally
  }

  return invoice;
}

async function generateAllMonthlyInvoices() {
  const now = new Date();
  const periodEnd = new Date(now.getFullYear(), now.getMonth(), 0); // Last day of previous month
  const periodStart = new Date(periodEnd.getFullYear(), periodEnd.getMonth(), 1); // First day of previous month

  const { rows: users } = await query(
    'SELECT id FROM users WHERE plan_id IS NOT NULL AND role != $1',
    ['superadmin']
  );

  console.log(`[InvoiceService] Generating invoices for ${users.length} users (${periodStart.toISOString().split('T')[0]} to ${periodEnd.toISOString().split('T')[0]})`);

  let count = 0;
  for (const user of users) {
    try {
      // Check if invoice already exists for this period
      const { rows: existing } = await query(
        'SELECT id FROM invoices WHERE user_id = $1 AND period_start = $2',
        [user.id, periodStart]
      );
      if (existing.length > 0) {
        console.log(`[InvoiceService] Invoice already exists for user ${user.id}, skipping`);
        continue;
      }

      await generateMonthlyInvoice(user.id, periodStart, periodEnd);
      count++;
    } catch (err) {
      console.error(`[InvoiceService] Failed to generate invoice for user ${user.id}:`, err.message);
    }
  }

  console.log(`[InvoiceService] Generated ${count} invoices`);
  return count;
}

module.exports = { generateMonthlyInvoice, generateAllMonthlyInvoices };
