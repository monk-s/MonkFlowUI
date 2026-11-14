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
