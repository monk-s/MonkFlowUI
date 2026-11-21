/**
 * Engagement tracker vocabulary shared by the client routes (routes/portal)
 * and the staff routes (controllers/engagement.controller.js).
 */
const STAGES = ['discovery', 'architecture', 'integration', 'production'];
const STAGE_LABELS = {
  discovery: 'Discovery and audit',
  architecture: 'Architecture and sandbox',
  integration: 'Integration and QA',
  production: 'Production and scale',
};
const MILESTONE_STATUSES = ['planned', 'in_progress', 'awaiting_signoff', 'complete'];
const ACTION_KINDS = ['uat', 'credentials', 'documents', 'other'];

const day = (v) => (v ? (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10)) : null);

const engagementView = (e, milestones) => ({
  id: e.id, name: e.name, summary: e.summary, stage: e.stage, stageLabel: STAGE_LABELS[e.stage], status: e.status,
  nextDeliverable: e.next_deliverable, nextDeliverableDue: day(e.next_deliverable_due), createdAt: e.created_at,
  milestones: milestones.filter((m) => m.engagement_id === e.id).map(milestoneView),
});

const milestoneView = (m) => ({
  id: m.id, engagementId: m.engagement_id, stage: m.stage, title: m.title, detail: m.detail, dueOn: day(m.due_on),
  status: m.status, signedOffByName: m.signed_off_by_name, signedOffAt: m.signed_off_at,
});

const actionItemView = (a) => ({
  id: a.id, kind: a.kind, title: a.title, detail: a.detail, dueOn: day(a.due_on), status: a.status,
  engagementId: a.engagement_id, completedByName: a.completed_by_name, completedAt: a.completed_at, createdAt: a.created_at,
  origin: a.origin, requestedByName: a.requested_by_name, reply: a.reply,
});

/**
 * One line for the activity list on the client's Overview. Only engagement.*
 * and action.* events are shown there; anything else stays in the audit log,
 * which reviewers may not read.
 */
function activitySummary(action, m = {}) {
  const t = m.title ? `: ${m.title}` : '';
  switch (action) {
    case 'engagement.created': return `Engagement opened${m.name ? `: ${m.name}` : ''}`;
    case 'engagement.stage_changed': return `Moved to ${STAGE_LABELS[m.to] || m.to}`;
    case 'engagement.updated': return `Engagement details updated${m.name ? `: ${m.name}` : ''}`;
    case 'engagement.milestone_added': return `Milestone added${t}`;
    case 'engagement.milestone_ready': return `Ready for sign-off${t}`;
    case 'engagement.milestone_signed_off': return `Signed off${t}`;
    case 'engagement.milestone_completed': return `Milestone complete${t}`;
    case 'engagement.milestone_updated': return `Milestone updated${t}`;
    case 'engagement.milestone_removed': return `Milestone removed${t}`;
    case 'engagement.baseline_set': return `Time-saved baseline set for ${m.workflow || 'a workflow'}: ${m.minutes} minutes per run`;
    case 'engagement.baseline_cleared': return `Time-saved baseline removed for ${m.workflow || 'a workflow'}`;
    case 'action.requested': return `Requested from your team${t}`;
    case 'action.completed': return `Marked done${t}`;
    case 'action.withdrawn': return `Request withdrawn${t}`;
    default: return action;
  }
}

module.exports = { STAGES, STAGE_LABELS, MILESTONE_STATUSES, ACTION_KINDS, day, engagementView, milestoneView, actionItemView, activitySummary };
