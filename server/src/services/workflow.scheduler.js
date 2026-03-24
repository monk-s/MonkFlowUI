const cron = require('node-cron');
const workflowModel = require('../models/workflow.model');
const { executeWorkflow } = require('./workflow.engine');

const jobs = new Map(); // workflowId -> cron job

async function loadScheduledWorkflows() {
  const workflows = await workflowModel.findActiveScheduled();
  for (const wf of workflows) {
    scheduleWorkflow(wf);
  }
  console.log(`Loaded ${workflows.length} scheduled workflow(s)`);
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
}

module.exports = { loadScheduledWorkflows, scheduleWorkflow, unscheduleWorkflow, stopAll };
