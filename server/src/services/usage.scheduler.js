const cron = require('node-cron');
const { query } = require('../config/database');

let task = null;

async function hb(status, detail) {
  try {
    await query(
      `INSERT INTO scheduler_heartbeats (name, last_run_at, last_status, last_detail, updated_at)
       VALUES ('usage', NOW(), $1, $2, NOW())
       ON CONFLICT (name) DO UPDATE SET last_run_at = NOW(), last_status = $1, last_detail = $2, updated_at = NOW()`,
      [status, detail ? JSON.stringify(detail) : null]
    );
  } catch (_) {}
}

function start() {
  // Run daily at midnight UTC
  task = cron.schedule('0 0 * * *', async () => {
    console.log('[UsageScheduler] Running monthly usage reset check...');
    await hb('started', null);
    let overagesRecorded = 0;
    try {
      // Find users with stale usage_reset_at (from previous month)
      const { rows: staleUsers } = await query(
        `SELECT u.id, u.plan_id, u.monthly_workflow_runs, u.monthly_agent_tasks,
                p.monthly_workflow_runs as plan_workflow_limit, p.monthly_agent_tasks as plan_task_limit,
                p.overage_run_cents, p.overage_task_cents
         FROM users u LEFT JOIN plans p ON u.plan_id = p.id
         WHERE u.usage_reset_at < DATE_TRUNC('month', NOW())
           AND u.plan_id IS NOT NULL`
      );

      for (const user of staleUsers) {
        // Calculate overages
        const overageRuns = Math.max(0, user.monthly_workflow_runs - (user.plan_workflow_limit || 0));
        const overageTasks = Math.max(0, user.monthly_agent_tasks - (user.plan_task_limit || 0));

        if (overageRuns > 0 || overageTasks > 0) {
          const overageCost = (overageRuns * (user.overage_run_cents || 50)) + (overageTasks * (user.overage_task_cents || 30));
          const periodEnd = new Date();
          const periodStart = new Date(periodEnd.getFullYear(), periodEnd.getMonth() - 1, 1);

          await query(
            `INSERT INTO usage_overages (user_id, period_start, period_end, overage_workflow_runs, overage_agent_tasks, overage_cost_cents)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [user.id, periodStart, periodEnd, overageRuns, overageTasks, overageCost]
          );
          console.log(`[UsageScheduler] Recorded overage for user ${user.id}: ${overageRuns} runs, ${overageTasks} tasks`);
          overagesRecorded++;
        }

        // Reset counters
        await query(
          "UPDATE users SET monthly_workflow_runs = 0, monthly_agent_tasks = 0, usage_reset_at = DATE_TRUNC('month', NOW()) WHERE id = $1",
          [user.id]
        );
      }

      if (staleUsers.length > 0) {
        console.log(`[UsageScheduler] Reset usage for ${staleUsers.length} users`);
      }
      await hb('success', { usersReset: staleUsers.length, overagesRecorded });
    } catch (err) {
      console.error('[UsageScheduler] Error:', err.message);
      await hb('failed', { error: err.message });
    }
  }, { timezone: 'UTC' });

  console.log('[UsageScheduler] Started — runs daily at midnight UTC');
}

function stop() {
  if (task) {
    task.stop();
    task = null;
    console.log('[UsageScheduler] Stopped');
  }
}

module.exports = { start, stop };
