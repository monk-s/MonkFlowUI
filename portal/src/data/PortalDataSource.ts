// Every signed-in screen reads and writes through this interface.
//
// Two implementations:
//   ApiDataSource   the real API (/api/v1/portal), used when signed in
//   DemoDataSource  synthetic data held in the browser, for Demo Mode
//                   (arrives with the Review Studio)
// Screens must not call fetch() or the api helper directly, or Demo Mode
// would leak requests to the real API.
import { createContext, useContext } from 'react';
import type {
  ActionItem, ActivityEntry, Engagement, PeriodDays, Role, RunDetail, SsoProvider, Team, Telemetry, Vertical, WorkflowDetail, WorkflowRow,
} from '../lib/types';

export type MemberRole = Exclude<Role, 'monkflow_staff'>;

export interface WorkspaceSettings {
  id: string;
  name: string;
  slug: string;
  vertical: Vertical;
  parentOrgId: string | null;
  allowedEmailDomains: string[];
  ssoProvider: SsoProvider | null;
  ssoRequired: boolean;
  sessionIdleMinutes: number;
}

export interface PortalDataSource {
  /** True for Demo Mode: screens show the demo banner and never imply data is saved. */
  readonly demo: boolean;

  getWorkspace(): Promise<WorkspaceSettings>;

  getTeam(): Promise<Team>;
  invite(email: string, role: MemberRole): Promise<{ emailSent: boolean }>;
  resendInvitation(id: string): Promise<{ emailSent: boolean }>;
  revokeInvitation(id: string): Promise<void>;
  updateMember(id: string, change: { role?: MemberRole; status?: 'active' | 'suspended' }): Promise<void>;
  removeMember(id: string): Promise<void>;

  /** What is waiting on the client, soonest due first. */
  getActions(): Promise<ActionItem[]>;
  /** Mark a request from MonkFlow as done. */
  completeAction(id: string): Promise<void>;
  getEngagements(): Promise<Engagement[]>;
  /** Sign off a milestone MonkFlow marked ready. Recorded with name and time; cannot be undone. */
  signOffMilestone(id: string): Promise<void>;
  getActivity(): Promise<ActivityEntry[]>;

  /** Counted from this workspace's own runs. `started: false` before the first run. */
  getTelemetry(days: PeriodDays): Promise<Telemetry>;
  getWorkflows(days: PeriodDays): Promise<WorkflowRow[]>;
  getWorkflow(id: string, days: PeriodDays): Promise<WorkflowDetail>;
  getRun(workflowId: string, runId: string): Promise<RunDetail>;
}

const Ctx = createContext<PortalDataSource | null>(null);
export const DataSourceProvider = Ctx.Provider;

export function useData(): PortalDataSource {
  const ds = useContext(Ctx);
  if (!ds) throw new Error('useData must be used inside <DataSourceProvider>');
  return ds;
}
