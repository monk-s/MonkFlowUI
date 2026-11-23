// Demo Mode's data: everything is made up in the browser from
// demo/fixtures.ts (EXAMPLE_DATA). It never calls the API, never signs in and
// sets no cookie, so it cannot reach a client workspace.
//
// Changes a visitor makes (edits, approvals, sign-offs) are kept in
// sessionStorage for the tab and thrown away by reset().
import { ApiError } from '../lib/api';
import type {
  ActionItem, ActivityEntry, DayCount, Engagement, HoursSaved, PeriodDays, ReviewItem, ReviewList, ReviewStatus, ReviewSummary, Run, RunTotals, Session,
  SyntheticPage, Team, K1Export, K1Status, K1Tracker, K1TrackerRow, ReviewCheck, Telemetry, WorkflowDetail, WorkflowRow, WorkflowSummary, AuditEntry, AuditFilter, AuditPage, Connection, PortalRequest, Requests, VaultDocument,
} from '../lib/types';
import { runChecks, TEMPLATES } from '../demo/checks';
import { verticalPack } from '../verticals';
import { K1 } from '../demo/k1';
import { EXAMPLE_WORKSPACES, exampleEngagement, rng, type ExampleWorkspace } from '../demo/fixtures';
import type { PortalDataSource, WorkspaceSettings } from './PortalDataSource';

export type DemoKey = keyof typeof EXAMPLE_WORKSPACES;
export const isDemoKey = (v: string | undefined): v is DemoKey => !!v && Object.prototype.hasOwnProperty.call(EXAMPLE_WORKSPACES, v);

const YOU = 'Alex Morgan';
// A demo with a fixed "today" (the K-1 demo) runs on a shifted clock, so every date on screen agrees with it.
let shift = 0;
const clock = () => Date.now() + shift;
const stamp = () => new Date(clock()).toISOString();
const csv = (lines: unknown[][]) => new Blob([lines.map((l) => l.map((v) => { const t = String(v ?? ''); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; }).join(',')).join('\r\n') + '\r\n'], { type: 'text/csv' });
const DAY = 864e5;
const ymd = (t: number) => new Date(t).toISOString().slice(0, 10);

type StoredItem = Omit<ReviewItem, keyof ReturnType<typeof derive>> & {
  pages: SyntheticPage[]; images?: { pdfUrl: string; pages: { page: number; src: string }[] };
  /** K-1s: the tracker row, and why each failing check was accepted. */
  slug?: string; notes?: Record<string, NonNullable<ReviewCheck['note']>>;
};
interface State {
  actions: ActionItem[]; engagement: Engagement; activity: ActivityEntry[]; review: StoredItem[]; requests?: PortalRequest[];
  /** K-1 demo: tracker rows sent to the accountant, and K-1s added by hand. */
  sent?: string[]; uploads?: K1TrackerRow[];
}
/** The fields a person approves one by one: everything extracted, not the office's own records. */
const toApprove = (s: Pick<ReviewItem, 'template' | 'fields'>) => {
  const reference = TEMPLATES[s.template].groups.filter((g) => g.reference).map((g) => g.key);
  return s.fields.filter((f) => !reference.includes(f.group));
};

/** Everything about an item that follows from its fields. Same rules as server/src/portal/review.js. */
function derive(item: Pick<ReviewItem, 'template' | 'fields' | 'status'>) {
  const checks = runChecks(item.template, item.fields);
  const scored = item.fields.filter((f) => f.confidence !== null);
  return {
    checks,
    fieldCount: item.fields.length,
    flagged: scored.filter((f) => (f.confidence as number) < 0.95 && !f.editedAt).length,
    lowestConfidence: scored.length ? Math.min(...scored.map((f) => f.confidence as number)) : null,
    checksPassed: checks.filter((c) => c.status === 'pass').length,
    checksTotal: checks.filter((c) => c.status !== 'na').length,
    blocked: checks.some((c) => c.blocking && c.status === 'fail'),
    canDecide: item.status === 'queued',
  };
}

const notInDemo = () => new ApiError(403, 'This is a demo workspace, so people and invitations cannot be changed here.', 'demo');

export class DemoDataSource implements PortalDataSource {
  readonly demo = true;
  readonly base: string;
  private readonly key: string;
  private readonly example: ExampleWorkspace;
  private state: State;
  /** The made-up person and workspace the shell shows. */
  readonly session: Session;

  constructor(readonly which: DemoKey) {
    this.base = `/demo/${which}`;
    this.key = `mf.demo.${which}`;
    this.example = EXAMPLE_WORKSPACES[which]();
    shift = this.example.today ? Date.parse(`${this.example.today}T15:00:00Z`) - Date.now() : 0;
    this.session = this.makeSession();
    // Only the family-office demo has K-1 screens; the shell shows them where this method exists.
    if (which !== 'family-office') (this as { getK1Tracker?: unknown }).getK1Tracker = undefined;
    this.state = this.load() ?? this.fresh();
  }

  private makeSession(): Session {
    const org = { id: `demo-${this.which}`, name: this.example.name, slug: `demo-${this.which}`, vertical: this.example.vertical, role: 'admin' as const };
    const far = new Date(clock() + 365 * DAY).toISOString();
    return {
      user: { id: 'demo-user', email: 'alex.morgan@demo.example', firstName: 'Alex', lastName: 'Morgan', isPlatformAdmin: false },
      org, role: 'admin', workspaces: [org], authMethod: 'password', mfaVerified: true, mfaSetupRequired: false,
      idleMinutes: 30, idleExpiresAt: far, expiresAt: far,
      permissions: ['overview.view', 'workflows.view', 'review.view', 'review.decide', 'engagement.signoff', 'actions.complete', 'connectors.view', 'vault.view', 'requests.create', 'team.view', 'team.manage', 'data.export', 'audit.view'],
    };
  }

  reset() {
    try { sessionStorage.removeItem(this.key); } catch { /* private mode */ }
    this.state = this.fresh();
  }

  private load(): State | null {
    try { return JSON.parse(sessionStorage.getItem(this.key) ?? 'null') as State | null; } catch { return null; }
  }
  private save() {
    try { sessionStorage.setItem(this.key, JSON.stringify(this.state)); } catch { /* private mode: changes last until reload */ }
  }

  private fresh(): State {
    const now = clock();
    const ago = (hours: number) => new Date(now - hours * 36e5).toISOString();
    const engagement = exampleEngagement(this.example, (offset) => ymd(now + offset * DAY));
    return {
      engagement,
      actions: [
        { id: 'ms-3', kind: 'signoff', title: this.example.signoff, detail: null, dueOn: ymd(now + 3 * DAY), engagementName: engagement.name, canAct: true },
        { id: 'act-1', ...this.example.request, dueOn: ymd(now + 6 * DAY), engagementName: engagement.name, canAct: true },
      ],
      activity: [
        { id: 'a3', at: ago(20), action: 'engagement.milestone_ready', summary: `Ready for sign-off: ${this.example.signoff}`, actor: 'MonkFlow' },
        { id: 'a2', at: ago(70), action: 'engagement.stage_changed', summary: 'Moved to Integration and QA', actor: 'MonkFlow' },
        { id: 'a1', at: ago(19 * 24), action: 'engagement.milestone_signed_off', summary: 'Signed off: Sandbox walkthrough', actor: YOU },
      ],
      review: this.example.documents.map((d, i) => ({
        id: `doc-${i + 1}`, title: d.title, template: d.template, templateLabel: TEMPLATES[d.template].label, subject: d.subject, period: d.period,
        workflowId: 'wf-1', workflowName: this.example.workflows[0].name, status: d.decided?.status ?? 'queued', receivedAt: ago(d.hoursAgo),
        decidedByName: d.decided?.by ?? null, decidedAt: d.decided ? ago(d.hoursAgo - 3) : null, decisionReason: null,
        groups: TEMPLATES[d.template].groups, fields: d.fields, pages: d.pages, ...(d.images ? { images: d.images, slug: d.slug } : {}),
        document: 'available', documentName: null, documentPurgeAfter: null,
        trail: [
          { id: 't1', at: ago(d.hoursAgo), action: 'review.received', actor: 'MonkFlow', metadata: { fields: d.fields.length } },
          ...(d.decided ? [{ id: 't2', at: ago(d.hoursAgo - 3), action: 'review.approved', actor: d.decided.by, metadata: {} }] : []),
        ],
      })),
    };
  }

  // ── Requests, Vault, Integrations ──
  async getRequests(): Promise<Requests> {
    const now = clock();
    const example: PortalRequest = {
      id: 'req-0', title: 'Add the reviewer\'s initials to the export', detail: 'Our file checklist has a column for it.', status: 'done',
      createdAt: new Date(now - 9 * DAY).toISOString(), dueOn: null, requestedByName: 'Priya Raman',
      reply: 'Done. It is the last column of the export from this week\'s run.', closedByName: 'MonkFlow', closedAt: new Date(now - 7 * DAY).toISOString(),
    };
    return {
      sent: [...(this.state.requests ?? []), example],
      received: this.state.actions.filter((a) => a.kind !== 'signoff').map((a) => ({
        id: a.id, title: a.title, detail: a.detail, status: 'open' as const, createdAt: new Date(now - 2 * DAY).toISOString(), dueOn: a.dueOn,
        requestedByName: null, reply: null, closedByName: null, closedAt: null,
      })),
      canCreate: true,
    };
  }
  async createRequest(input: { title: string; detail: string }) {
    (this.state.requests ??= []).unshift({
      id: `req-${clock()}`, title: input.title, detail: input.detail || null, status: 'open', createdAt: stamp(), dueOn: null,
      requestedByName: YOU, reply: null, closedByName: null, closedAt: null,
    });
    this.log('request.created', input.title);
    this.save();
  }
  async withdrawRequest(id: string) {
    const r = (this.state.requests ?? []).find((x) => x.id === id);
    if (r) { r.status = 'withdrawn'; this.log('request.withdrawn', r.title); }
    this.save();
  }
  async getVault(): Promise<VaultDocument[]> {
    return this.state.review.map((r, i) => ({
      id: r.id, filename: `${r.title.replace(/[^\w.\- ]/g, '').replace(/ +/g, '-').toLowerCase()}.pdf`, bytes: 180_000 + i * 42_500, storedAt: r.receivedAt,
      title: r.title, typeLabel: r.templateLabel, reviewId: r.id, reviewStatus: r.status,
      available: true, deleteAfter: new Date(new Date(r.receivedAt).getTime() + 90 * DAY).toISOString(), deletedAt: null,
    }));
  }
  async getConnections(): Promise<Connection[]> {
    const now = clock();
    const at = (hours: number) => new Date(now - hours * 36e5).toISOString();
    const [a, b, c] = verticalPack(this.example.vertical).systems;
    return [
      { id: 'c1', system: a, status: 'healthy', note: 'Nightly export, read-only.', lastSyncAt: at(7), updatedAt: at(7) },
      { id: 'c2', system: b, status: 'healthy', note: 'Reviewed figures are written back after approval.', lastSyncAt: at(26), updatedAt: at(26) },
      { id: 'c3', system: c, status: 'planned', note: 'Scheduled for the production stage.', lastSyncAt: null, updatedAt: at(240) },
    ];
  }

  // The demo's audit log is what has happened in this browser: the workspace
  // activity plus every decision and edit on a review item.
  private auditEntries(f: AuditFilter): AuditEntry[] {
    const row = (id: string, at: string, action: string, actor: string, detail: string): AuditEntry => ({
      id, at, action, actor, actorEmail: actor === 'MonkFlow' ? null : `${actor.replace(' ', '.').toLowerCase()}@demo.example`,
      actorRole: actor === 'MonkFlow' ? 'monkflow_staff' : 'admin', target: '', detail, ip: null,
    });
    const all = [
      ...this.state.activity.map((a) => row(a.id, a.at, a.action, a.actor, a.summary)),
      ...this.state.review.flatMap((r) => r.trail.map((t) => row(`${r.id}-${t.id}`, t.at, t.action, t.actor, r.title))),
    ].sort((a, b) => b.at.localeCompare(a.at));
    const q = (f.q ?? '').trim().toLowerCase();
    return all.filter((e) => (!q || e.action.includes(q) || (e.actorEmail ?? '').includes(q))
      && (!f.from || e.at.slice(0, 10) >= f.from) && (!f.to || e.at.slice(0, 10) <= f.to));
  }
  async getAudit(filter: AuditFilter): Promise<AuditPage> {
    const entries = this.auditEntries(filter);
    return { entries, nextBefore: null, chain: { ok: true, entries: this.auditEntries({}).length } };
  }
  async exportAudit(filter: AuditFilter) {
    const cell = (v: unknown) => { const t = String(v ?? ''); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
    const lines = [['Time (UTC)', 'Person', 'Email', 'Role', 'Action', 'Target', 'Detail', 'IP address'],
      ...this.auditEntries(filter).map((e) => [e.at, e.actor, e.actorEmail, e.actorRole, e.action, e.target, e.detail, e.ip])];
    return { filename: 'audit-log.csv', blob: new Blob([lines.map((l) => l.map(cell).join(',')).join('\r\n') + '\r\n'], { type: 'text/csv' }) };
  }

  private log(action: string, summary: string) {
    this.state.activity.unshift({ id: `a${clock()}`, at: stamp(), action, summary, actor: YOU });
  }

  // ── Workspace and people (read-only in the demo) ──
  async getWorkspace(): Promise<WorkspaceSettings> {
    const org = this.session.org;
    return { id: org!.id, name: org!.name, slug: org!.slug, vertical: org!.vertical, parentOrgId: null, allowedEmailDomains: ['demo.example'], ssoProvider: null, ssoRequired: false, sessionIdleMinutes: 30 };
  }
  async getTeam(): Promise<Team> {
    const person = (id: string, firstName: string, lastName: string, role: 'admin' | 'reviewer' | 'auditor', roleLabel: string, isYou = false) => ({
      id, userId: id, email: `${firstName}.${lastName}@demo.example`.toLowerCase(), firstName, lastName, role, roleLabel, status: 'active' as const,
      joinedAt: new Date(clock() - 60 * DAY).toISOString(), signInMethod: 'password' as const, lastActiveAt: new Date(clock() - (isYou ? 0 : 5 * 36e5)).toISOString(), isYou,
    });
    return {
      members: [person('p1', 'Alex', 'Morgan', 'admin', 'Admin / Managing Partner', true), person('p2', 'Priya', 'Raman', 'reviewer', 'Operations / Analyst Reviewer'), person('p3', 'Sam', 'Whitfield', 'auditor', 'Read-Only Auditor')],
      invitations: [],
      roles: [{ value: 'admin', label: 'Admin / Managing Partner' }, { value: 'reviewer', label: 'Operations / Analyst Reviewer' }, { value: 'auditor', label: 'Read-Only Auditor' }],
    };
  }
  async invite(): Promise<{ emailSent: boolean }> { throw notInDemo(); }
  async resendInvitation(): Promise<{ emailSent: boolean }> { throw notInDemo(); }
  async revokeInvitation(): Promise<void> { throw notInDemo(); }
  async updateMember(): Promise<void> { throw notInDemo(); }
  async removeMember(): Promise<void> { throw notInDemo(); }

  // ── Engagement ──
  async getActions() { return this.state.actions; }
  async completeAction(id: string) {
    const a = this.state.actions.find((x) => x.id === id);
    this.state.actions = this.state.actions.filter((x) => x.id !== id);
    if (a) this.log('action.completed', `Done: ${a.title}`);
    this.save();
  }
  async getEngagements() { return [this.state.engagement]; }
  async signOffMilestone(id: string) {
    const m = this.state.engagement.milestones.find((x) => x.id === id);
    if (!m || m.status !== 'awaiting_signoff') throw new ApiError(409, 'This milestone is not ready for sign-off.', 'not_awaiting_signoff');
    Object.assign(m, { status: 'complete', signedOffByName: YOU, signedOffAt: stamp() });
    this.state.actions = this.state.actions.filter((x) => x.id !== id);
    this.log('engagement.milestone_signed_off', `Signed off: ${m.title}`);
    this.save();
  }
  async getActivity() { return this.state.activity.slice(0, 12); }

  // ── Workflows and telemetry: generated from a seed, the same on every visit ──
  private workflow(i: number): WorkflowSummary {
    const w = this.example.workflows[i];
    return { id: `wf-${i + 1}`, name: w.name, description: w.description, status: 'active', trigger: i === 0 ? 'webhook' : 'schedule', createdAt: new Date(clock() - 75 * DAY).toISOString() };
  }
  /** Runs of workflow `i` over the last `days` days, newest first. */
  private runs(i: number, days: number): Run[] {
    const today = Math.floor(clock() / DAY);
    const out: Run[] = [];
    for (let d = 0; d < Math.min(days, 45); d++) {   // the example workflows went live 45 days ago
      const dayNo = today - d;
      const rand = rng(dayNo * 31 + i * 7 + this.which.length);
      const weekend = [0, 6].includes(new Date(dayNo * DAY).getUTCDay());
      const n = weekend ? 0 : Math.round(rand() * this.example.workflows[i].perDay);
      for (let k = 0; k < n; k++) {
        const start = dayNo * DAY + (13 + rand() * 9) * 36e5;
        if (start > clock()) continue;
        const failed = rand() < 0.04;
        const durationMs = Math.round(20000 + rand() * 70000);
        out.push({ id: `run-${i + 1}-${dayNo}-${k}`, status: failed ? 'failed' : 'completed', trigger: i === 0 ? 'webhook' : 'schedule', startedAt: new Date(start).toISOString(),
          completedAt: new Date(start + durationMs).toISOString(), durationMs, error: failed ? 'The source file could not be read (scan was blank)' : null });
      }
    }
    return out.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }
  private numbers(which: number[], days: PeriodDays): { totals: RunTotals; series: DayCount[]; saved: HoursSaved } {
    const perWorkflow = which.map((i) => ({ i, runs: this.runs(i, days) }));
    const all = perWorkflow.flatMap((w) => w.runs);
    const completed = all.filter((r) => r.status === 'completed');
    const failed = all.length - completed.length;
    const sorted = completed.map((r) => r.durationMs as number).sort((a, b) => a - b);
    const series: DayCount[] = Array.from({ length: days }, (_, k) => {
      const day = ymd(clock() - (days - 1 - k) * DAY);
      const on = all.filter((r) => r.startedAt.slice(0, 10) === day);
      return { day, runs: on.length, completed: on.filter((r) => r.status === 'completed').length, failed: on.filter((r) => r.status === 'failed').length };
    });
    const basis = perWorkflow.map(({ i, runs }) => {
      const w = this.example.workflows[i];
      const done = runs.filter((r) => r.status === 'completed').length;
      return { workflowId: `wf-${i + 1}`, workflow: w.name, runs: done, minutesPerRun: w.baselineMinutes, basis: w.basis, from: ymd(clock() - 45 * DAY), hours: (done * w.baselineMinutes) / 60 };
    });
    return {
      totals: { runs: all.length, completed: completed.length, failed, successRate: all.length ? completed.length / all.length : null, medianMs: sorted.length ? sorted[Math.floor(sorted.length / 2)] : null },
      series,
      saved: { hours: basis.reduce((n, b) => n + b.hours, 0), basis },
    };
  }
  async getTelemetry(days: PeriodDays): Promise<Telemetry> {
    const all = this.example.workflows.map((_, i) => i);
    return { days, started: true, workflows: all.length, firstRunAt: new Date(clock() - 45 * DAY).toISOString(), ...this.numbers(all, days) };
  }
  async getWorkflows(days: PeriodDays): Promise<WorkflowRow[]> {
    return this.example.workflows.map((_, i) => {
      const { totals } = this.numbers([i], days);
      return { ...this.workflow(i), lastRunAt: this.runs(i, 90)[0]?.startedAt ?? null, runs: totals.runs, completed: totals.completed, failed: totals.failed, successRate: totals.successRate };
    });
  }
  private index(id: string) {
    const i = this.example.workflows.findIndex((_, n) => `wf-${n + 1}` === id);
    if (i < 0) throw new ApiError(404, 'Not found', 'http_404');
    return i;
  }
  async getWorkflow(id: string, days: PeriodDays): Promise<WorkflowDetail> {
    const i = this.index(id);
    return { days, workflow: this.workflow(i), ...this.numbers([i], days), runs: this.runs(i, 90).slice(0, 50) };
  }
  async getRun(workflowId: string, runId: string) {
    const i = this.index(workflowId);
    const run = this.runs(i, 90).find((r) => r.id === runId);
    if (!run) throw new ApiError(404, 'Not found', 'http_404');
    const at = (ms: number) => new Date(new Date(run.startedAt).getTime() + ms).toISOString();
    return {
      workflow: { id: workflowId, name: this.example.workflows[i].name }, run,
      logs: [
        { id: 'l1', level: 'info' as const, message: 'Received 1 file', at: at(400) },
        run.status === 'failed'
          ? { id: 'l2', level: 'error' as const, message: run.error as string, at: at(run.durationMs as number) }
          : { id: 'l2', level: 'info' as const, message: 'Extracted fields and ran checks; sent to the review queue', at: at(run.durationMs as number) },
      ],
    };
  }

  // ── Review ──
  private view(s: StoredItem): ReviewItem {
    const { pages: _pages, images: _images, notes, ...rest } = s;
    const derived = derive(s);
    return { ...rest, ...derived, fieldApproval: TEMPLATES[s.template].fieldApproval, checks: derived.checks.map((c) => (notes?.[c.id] && c.status === 'fail' ? { ...c, note: notes[c.id] } : c)) };
  }
  private item(id: string): StoredItem {
    const s = this.state.review.find((r) => r.id === id);
    if (!s) throw new ApiError(404, 'Not found', 'http_404');
    return s;
  }
  async getReviewList(status?: ReviewStatus): Promise<ReviewList> {
    const all = this.state.review.map((s) => this.view(s));
    const counts = { queued: 0, approved: 0, rejected: 0 };
    for (const i of all) counts[i.status]++;
    const items: ReviewSummary[] = all.filter((i) => !status || i.status === status).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
    return { items, counts };
  }
  async getReviewItem(id: string) { return this.view(this.item(id)); }
  reviewDocument(item: ReviewItem) {
    const s = this.state.review.find((r) => r.id === item.id);
    if (s?.images) return { kind: 'images' as const, ...s.images };
    return s ? { kind: 'synthetic' as const, pages: s.pages } : null;
  }
  async editReviewFields(id: string, edits: { id: string; value: string }[]) {
    const s = this.item(id);
    if (s.status !== 'queued') throw new ApiError(409, 'This document has already been decided and can no longer be edited.', 'already_decided');
    const changed: string[] = [];
    for (const e of edits) {
      const f = s.fields.find((x) => x.id === e.id);
      const value = e.value.trim();
      if (!f || value === f.value) continue;
      if (f.original === null) f.original = f.value;
      // A corrected value is one its editor stands behind, so it also counts as approved.
      Object.assign(f, { value, editedByName: YOU, editedAt: stamp() }, TEMPLATES[s.template].fieldApproval ? { approvedByName: YOU, approvedAt: stamp() } : {});
      changed.push(f.row === null ? f.label : `${f.label}, row ${f.row + 1}`);
    }
    if (changed.length) s.trail.push({ id: `t${clock()}`, at: stamp(), action: 'review.fields_edited', actor: YOU, metadata: { fields: changed } });
    this.save();
    return this.view(s);
  }
  private decide(id: string, status: 'approved' | 'rejected', reason: string) {
    const s = this.item(id);
    if (s.status !== 'queued') throw new ApiError(409, `This document was already ${s.status}.`, 'already_decided');
    const perField = !!TEMPLATES[s.template].fieldApproval;
    if (status === 'approved' && perField) {
      if (toApprove(s).some((f) => !f.approvedAt)) throw new ApiError(409, 'Every field has to be approved first.', 'fields_unapproved');
      if (derive(s).checks.some((c) => c.status === 'fail' && !s.notes?.[c.id])) throw new ApiError(409, 'Every flag has to be cleared or have a note.', 'flags_open');
    }
    const blocked = !perField && derive(s).blocked;
    if (status === 'approved' && blocked && reason.length < 10) throw new ApiError(409, 'A check is failing. Fix the fields, or approve with a written reason of at least 10 characters.', 'checks_failing');
    const keep = status === 'rejected' || blocked;
    Object.assign(s, { status, decidedByName: YOU, decidedAt: stamp(), decisionReason: keep ? reason : null });
    s.trail.push({ id: `t${clock()}`, at: stamp(), action: `review.${status}`, actor: YOU, metadata: keep ? { reason } : {} });
    this.save();
    return this.view(s);
  }
  async approveReview(id: string, reason = '') { return this.decide(id, 'approved', reason.trim()); }
  async rejectReview(id: string, reason: string) { return this.decide(id, 'rejected', reason.trim()); }
  async exportReview(id: string, format: 'csv' | 'json') {
    const item = this.view(this.item(id));
    const name = item.title.replace(/[^\w.\- ]/g, '_');
    if (format === 'json') return { filename: `${name}.json`, blob: new Blob([JSON.stringify(item, null, 2)], { type: 'application/json' }) };
    const group = Object.fromEntries(item.groups.map((g) => [g.key, g.label]));
    const lines = [['Section', 'Row', 'Field', 'Value', 'Extracted value', 'Confidence', 'Page', 'Edited by', 'Edited at'],
      ...item.fields.map((f) => [group[f.group], f.row === null ? '' : f.row + 1, f.label, f.value, f.original ?? f.value, f.confidence ?? '', f.page ?? '', f.editedByName ?? '', f.editedAt ?? ''])];
    return { filename: `${name}.csv`, blob: csv(lines) };
  }

  // ── Per-field approval and the K-1 tracker ──
  async approveReviewFields(id: string, fieldIds: string[]) {
    const s = this.item(id);
    if (s.status !== 'queued') throw new ApiError(409, `This document was already ${s.status}.`, 'already_decided');
    const mine = toApprove(s).filter((f) => fieldIds.includes(f.id) && !f.approvedAt);
    for (const f of mine) Object.assign(f, { approvedByName: YOU, approvedAt: stamp() });
    if (mine.length) s.trail.push({ id: `t${clock()}`, at: stamp(), action: 'review.fields_approved', actor: YOU, metadata: { fields: mine.length === 1 ? mine[0].label : `${mine.length} fields` } });
    this.save();
    return this.view(s);
  }
  async noteReviewCheck(id: string, checkId: string, text: string) {
    const s = this.item(id);
    if (s.status !== 'queued') throw new ApiError(409, `This document was already ${s.status}.`, 'already_decided');
    const check = derive(s).checks.find((c) => c.id === checkId);
    if (!check) throw new ApiError(404, 'Not found', 'http_404');
    s.notes ??= {};
    if (text.trim()) {
      s.notes[checkId] = { text: text.trim(), by: YOU, at: stamp() };
      s.trail.push({ id: `t${clock()}`, at: stamp(), action: 'review.check_noted', actor: YOU, metadata: { check: check.label, note: text.trim() } });
    } else delete s.notes[checkId];
    this.save();
    return this.view(s);
  }
  private k1Rows(): K1TrackerRow[] {
    const today = Date.parse(`${K1.today}T00:00:00Z`);
    const rows = K1.k1s.map((k): K1TrackerRow => {
      const s = this.state.review.find((r) => r.slug === k.slug);
      const item = s && this.view(s);
      // Only what the visitor did moves a row; the seeded history keeps the dates in k1-data.json.
      const mine = item ? item.trail.filter((t) => t.actor === YOU) : [];
      const touched = mine.length > 0 && item!.status === 'queued';
      const status: K1Status = item?.status === 'approved' ? (this.state.sent?.includes(k.slug) ? 'Sent to accountant' : 'Approved') : touched ? 'In review' : k.status as K1Status;
      const last = mine.length ? mine[mine.length - 1] : null;
      return {
        id: k.slug, investment: k.investment, entity: K1.entities[k.entity as keyof typeof K1.entities].name, type: k.type, status,
        expected: k.expected, received: k.received,
        daysLate: k.received ? 0 : Math.max(0, Math.round((today - Date.parse(`${k.expected}T00:00:00Z`)) / DAY)),
        openFlags: item && item.status === 'queued' ? item.checks.filter((c) => c.status === 'fail' && !c.note).length : 0,
        lastAction: status === 'Sent to accountant' ? 'Sent to the accountant' : last ? (last.action === 'review.approved' ? `Approved by ${last.actor}` : `Review in progress (${last.actor})`) : k.lastAction,
        lastActionOn: last ? last.at.slice(0, 10) : k.lastActionOn, reviewId: s?.id ?? null,
      };
    });
    return [...rows, ...(this.state.uploads ?? [])];
  }
  async getK1Tracker(): Promise<K1Tracker> {
    return { office: K1.office, taxYear: K1.taxYear, today: K1.today, rows: this.k1Rows() };
  }
  async uploadK1(filename: string) {
    (this.state.uploads ??= []).push({
      id: `up-${clock()}`, investment: filename.replace(/\.[^.]+$/, '').slice(0, 80), entity: 'Not yet assigned', type: 'Not yet known', status: 'In review',
      expected: K1.today, received: K1.today, daysLate: 0, openFlags: 0, lastAction: `Uploaded by hand (${YOU}); the demo does not read it`, lastActionOn: K1.today, reviewId: null,
    });
    this.log('k1.uploaded', filename);
    this.save();
  }
  async sendK1sToAccountant() {
    this.state.sent = this.state.review.filter((r) => r.slug && r.status === 'approved').map((r) => r.slug as string);
    this.log('k1.sent_to_accountant', `${this.state.sent.length} approved K-1s`);
    this.save();
  }
  async exportK1s(kind: K1Export) {
    const rows = this.k1Rows();
    const name = `cedar-ridge-k1-${kind}-${K1.taxYear}.csv`;
    if (kind === 'outstanding') {
      return { filename: name, blob: csv([['Investment', 'Investing entity', 'Type', 'Status', 'Expected date', 'Days late', 'Last action'],
        ...rows.filter((r) => r.status === 'Expected' || r.status === 'Estimate received').map((r) => [r.investment, r.entity, r.type, r.status, r.expected, r.daysLate || '', r.lastAction])]) };
    }
    const items = this.state.review.filter((r) => r.slug).map((r) => ({ row: rows.find((x) => x.id === r.slug)!, item: this.view(r) }));
    if (kind === 'exceptions') {
      return { filename: name, blob: csv([['Entity', 'Investment', 'Tax year', 'Check', 'Kind', 'Finding', 'Note', 'Noted by', 'Noted on'],
        ...items.flatMap(({ row, item }) => item.checks.filter((c) => c.status === 'fail').map((c) => [row.entity, row.investment, K1.taxYear, c.label, c.blocking ? 'Hard' : 'Soft', c.detail, c.note?.text ?? '', c.note?.by ?? '', c.note?.at.slice(0, 10) ?? '']))]) };
    }
    const figures = items.filter(({ item }) => item.status === 'approved').flatMap(({ row, item }) => item.fields
      .filter((f) => ['capital', 'part3', 'coded'].includes(f.group) && f.value.trim() && !/^(yes|no)$/i.test(f.value.trim()))
      .map((f) => {
        const coded = /^(\d+)([A-Z]+)$/.exec(f.key);
        return [row.entity, row.investment, K1.taxYear, f.group === 'capital' ? 'L' : coded ? coded[1] : f.key, f.group === 'capital' ? f.label.replace(/^L /, '') : coded ? coded[2] : '', f.value, f.approvedByName ?? '', f.approvedAt?.slice(0, 10) ?? ''];
      }));
    this.log('k1.exported', `${figures.length} approved figures`);
    return { filename: name, blob: csv([['Entity', 'Investment', 'Tax year', 'Box', 'Code', 'Amount', 'Approved by', 'Approved on'], ...figures]) };
  }
}
