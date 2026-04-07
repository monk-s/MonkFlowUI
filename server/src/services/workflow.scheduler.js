const cron = require('node-cron');
const workflowModel = require('../models/workflow.model');
const { executeWorkflow } = require('./workflow.engine');
const { query } = require('../config/database');

const jobs = new Map(); // workflowId -> cron job
let heartbeatJob = null;

async function hb(status, detail) {
  try {
    await query(
      `INSERT INTO scheduler_heartbeats (name, last_run_at, last_status, last_detail, updated_at)
       VALUES ('workflow', NOW(), $1, $2, NOW())
       ON CONFLICT (name) DO UPDATE SET last_run_at = NOW(), last_status = $1, last_detail = $2, updated_at = NOW()`,
      [status, detail ? JSON.stringify(detail) : null]
    );
  } catch (_) {}
}

async function loadScheduledWorkflows() {
  const workflows = await workflowModel.findActiveScheduled();
  for (const wf of workflows) {
    scheduleWorkflow(wf);
  }
  console.log(`Loaded ${workflows.length} scheduled workflow(s)`);

  // Start heartbeat cron — fires every 5 minutes to signal "workflow scheduler process alive"
  if (!heartbeatJob) {
    await hb('success', { activeJobs: jobs.size });
    heartbeatJob = cron.schedule('*/5 * * * *', async () => {
      await hb('success', { activeJobs: jobs.size });
    });
  }
}

function scheduleWorkflow(workflow) {
  if (!workflow.cron_expression || !cron.validate(workflow.cron_expression)) {
    console.warn(`Invalid cron for workflow ${workflow.id}: "${workflow.cron_expression}"`);
    return;
  }

  // Remove existing job if any
  unscheduleWorkflow(workflow.id);

  const job = cron.schedule(workflow.cron_expression, async () => {
    console.log(`[CRON] Executing workflow: ${workflow.name} (${workflow.id})`);
    try {
      await executeWorkflow(workflow, { trigger: 'schedule', scheduledAt: new Date().toISOString() });
    } catch (err) {
      console.error(`[CRON] Workflow ${workflow.id} failed:`, err.message);
    }
  });

  jobs.set(workflow.id, job);
}

function unscheduleWorkflow(workflowId) {
  const existing = jobs.get(workflowId);
  if (existing) {
    existing.stop();
    jobs.delete(workflowId);
  }
}

function stopAll() {
  for (const [id, job] of jobs) {
    job.stop();
  }
  jobs.clear();
  if (heartbeatJob) {
    heartbeatJob.stop();
    heartbeatJob = null;
  }
}

module.exports = { loadScheduledWorkflows, scheduleWorkflow, unscheduleWorkflow, stopAll };
