// Shapes shared by the screens. Mirrors what the API returns
// (server/src/services/session.service.js, routes/portal).

export type Vertical = 'CRE' | 'BANK' | 'INVESTMENT_FIRM';
export type Role = 'admin' | 'reviewer' | 'auditor' | 'monkflow_staff';
export type SsoProvider = 'microsoft' | 'google';

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  vertical: Vertical;
  parentOrgId?: string | null;
  role?: Role;
}

export interface Session {
  user: { id: string; email: string; firstName: string; lastName: string; isPlatformAdmin: boolean };
  org: Workspace | null;
  role: Role | null;
  permissions: string[];
  workspaces: Workspace[];
  authMethod: string;
  mfaVerified: boolean;
  mfaSetupRequired: boolean;
  idleMinutes: number;
  idleExpiresAt: string;
  expiresAt: string;
  lastOrgId?: string | null;
}

/** Where the API says to go once a sign-in step succeeds. */
export type NextStep = 'dashboard' | 'select-workspace' | 'mfa' | 'mfa-setup' | 'admin';
export interface SignInResult { next: NextStep; session?: Session }

export interface AuthMethods {
  password: boolean;
  passwordReset: boolean;
  emailCode: boolean;
  sso: SsoProvider[];
  mfa: boolean;
  passkey: boolean;
}

export interface Invitation {
  state: 'valid' | 'expired' | 'accepted' | 'invalid';
  email?: string;
  role?: Role;
  roleLabel?: string;
  org?: { name: string; vertical: Vertical };
  inviterName?: string;
  expiresAt?: string;
  accountExists?: boolean;
  ssoRequired?: SsoProvider | null;
  methods?: AuthMethods;
  minPasswordLength?: number;
}

export interface TeamMember {
  id: string;
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Exclude<Role, 'monkflow_staff'>;
  roleLabel: string;
  status: 'active' | 'suspended';
  joinedAt: string;
  signInMethod: 'password' | 'sso';
  lastActiveAt: string | null;
  isYou: boolean;
}

export interface PendingInvitation {
  id: string;
  email: string;
  role: Exclude<Role, 'monkflow_staff'>;
  roleLabel: string;
  createdAt: string;
  expiresAt: string;
  openedAt: string | null;
  expired: boolean;
}

export interface Team {
  members: TeamMember[];
  invitations: PendingInvitation[];
  roles: { value: Exclude<Role, 'monkflow_staff'>; label: string }[];
}

// ── Engagement tracker, actions, workflows, telemetry (routes/portal) ──

export type Stage = 'discovery' | 'architecture' | 'integration' | 'production';
export type MilestoneStatus = 'planned' | 'in_progress' | 'awaiting_signoff' | 'complete';

export interface Milestone {
  id: string;
  engagementId: string;
  stage: Stage;
  title: string;
  detail: string | null;
  /** YYYY-MM-DD */
  dueOn: string | null;
  status: MilestoneStatus;
  signedOffByName: string | null;
  signedOffAt: string | null;
}

export interface Engagement {
  id: string;
  name: string;
  summary: string | null;
  stage: Stage;
  stageLabel: string;
  status: 'active' | 'on_hold' | 'complete';
  nextDeliverable: string | null;
  nextDeliverableDue: string | null;
  milestones: Milestone[];
}

export type ActionKind = 'signoff' | 'uat' | 'credentials' | 'documents' | 'other';

/** Something waiting on the client. A 'signoff' action's id is the milestone's id. */
export interface ActionItem {
  id: string;
  kind: ActionKind;
  title: string;
  detail: string | null;
  dueOn: string | null;
  engagementName: string | null;
  /** False when this person's role may look but not act. */
  canAct: boolean;
}

// ── Requests, Vault, Integrations (routes/portal/sections.routes.js) ──
export interface PortalRequest {
  id: string; title: string; detail: string | null; status: 'open' | 'done' | 'withdrawn';
  createdAt: string; dueOn: string | null; requestedByName: string | null;
  /** MonkFlow's answer, on a closed request this workspace made. */
  reply: string | null; closedByName: string | null; closedAt: string | null;
}
export interface Requests { sent: PortalRequest[]; received: PortalRequest[]; canCreate: boolean }
export interface VaultDocument {
  id: string; filename: string; bytes: number; storedAt: string; title: string; typeLabel: string | null;
  /** The review item this file belongs to, where it can be opened. */
  reviewId: string | null; reviewStatus: ReviewStatus | null;
  /** False once the file has been deleted at its retention date. */
  available: boolean; deleteAfter: string | null; deletedAt: string | null;
}
export interface Connection { id: string; system: string; status: 'planned' | 'healthy' | 'attention' | 'down'; note: string | null; lastSyncAt: string | null; updatedAt: string }

export interface AuditEntry { id: string; at: string; action: string; actor: string; actorEmail: string | null; actorRole: string | null; target: string; detail: string; ip: string | null }
export interface AuditFilter { q?: string; from?: string; to?: string }
export interface AuditPage {
  entries: AuditEntry[];
  /** Pass as `before` to get the next, older page; null on the last page. */
  nextBefore: string | null;
  /** Result of the tamper check over the whole log; sent with the first page only. */
  chain: { ok: boolean; entries: number } | null;
}

export interface ActivityEntry { id: string; at: string; action: string; summary: string; actor: string }

export interface RunTotals {
  runs: number;
  completed: number;
  failed: number;
  /** completed / (completed + failed); null when nothing has finished. */
  successRate: number | null;
  medianMs: number | null;
}

export interface DayCount { day: string; runs: number; completed: number; failed: number }

export interface SavedBasis {
  workflowId: string;
  workflow: string;
  runs: number;
  minutesPerRun: number;
  /** Where the baseline came from, in MonkFlow's words as agreed with the client. */
  basis: string | null;
  from: string | null;
  hours: number;
}
/** Null when no workflow has an agreed baseline: then no hours figure is shown. */
export type HoursSaved = { hours: number; basis: SavedBasis[] } | null;

export type PeriodDays = 7 | 30 | 90;

export type Telemetry =
  | { days: PeriodDays; started: false; workflows: number }
  | { days: PeriodDays; started: true; workflows: number; firstRunAt: string; totals: RunTotals; series: DayCount[]; saved: HoursSaved };

export type WorkflowStatus = 'active' | 'paused' | 'error';

export interface WorkflowSummary {
  id: string;
  name: string;
  description: string | null;
  status: WorkflowStatus;
  trigger: string;
  createdAt: string;
}

export interface WorkflowRow extends WorkflowSummary {
  lastRunAt: string | null;
  runs: number;
  completed: number;
  failed: number;
  successRate: number | null;
}

export interface Run {
  id: string;
  status: 'running' | 'completed' | 'failed' | 'retrying';
  trigger: string;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  error: string | null;
}

export interface WorkflowDetail {
  days: PeriodDays;
  workflow: WorkflowSummary;
  totals: RunTotals;
  series: DayCount[];
  saved: HoursSaved;
  runs: Run[];
}

export interface RunLogLine { id: string; level: 'info' | 'warn' | 'error'; message: string; at: string }
export interface RunDetail { workflow: { id: string; name: string }; run: Run; logs: RunLogLine[] }

// ── Review queue (routes/portal/review.routes.js) ──

export type ReviewStatus = 'queued' | 'approved' | 'rejected';

export interface ReviewField {
  id: string;
  group: string;
  /** Row number inside a table section (0-based); null for a single figure. */
  row: number | null;
  key: string;
  label: string;
  value: string;
  /** What was extracted, once a person has changed it; null while untouched. */
  original: string | null;
  /** 0 to 1, or null when the pipeline gave none. */
  confidence: number | null;
  page: number | null;
  editedByName?: string;
  editedAt?: string;
}

export interface ReviewCheck {
  id: string;
  label: string;
  /** A failing blocking check stops approval unless a reason is typed. */
  blocking: boolean;
  /** 'na' = could not be run because a figure it needs was not extracted. */
  status: 'pass' | 'fail' | 'na';
  detail: string;
}

export interface ReviewSummary {
  id: string;
  title: string;
  template: string;
  templateLabel: string;
  subject: string | null;
  period: string | null;
  workflowId: string | null;
  workflowName: string | null;
  status: ReviewStatus;
  receivedAt: string;
  fieldCount: number;
  /** Low-confidence fields nobody has corrected yet. */
  flagged: number;
  lowestConfidence: number | null;
  checksPassed: number;
  checksTotal: number;
  blocked: boolean;
  decidedByName: string | null;
  decidedAt: string | null;
}

export interface ReviewTrailEntry { id: string; at: string; action: string; actor: string; metadata: Record<string, unknown> }

export interface ReviewItem extends ReviewSummary {
  groups: { key: string; label: string }[];
  fields: ReviewField[];
  checks: ReviewCheck[];
  decisionReason: string | null;
  /** 'purged' = the file was deleted at its retention date; the fields remain. */
  document: 'none' | 'purged' | 'available';
  documentName: string | null;
  documentPurgeAfter: string | null;
  trail: ReviewTrailEntry[];
  canDecide: boolean;
}

export interface ReviewList { items: ReviewSummary[]; counts: Record<ReviewStatus, number> }

/** A synthetic source document, drawn as HTML. Demo Mode only. */
export interface SyntheticPage { page: number; heading: string; rows: { text: string; fieldId?: string }[][] }
export type ReviewDocument = { kind: 'pdf'; url: string } | { kind: 'synthetic'; pages: SyntheticPage[] };
