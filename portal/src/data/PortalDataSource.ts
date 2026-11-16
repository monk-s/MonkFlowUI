// Every signed-in screen reads and writes through this interface.
//
// Two implementations:
//   ApiDataSource   the real API (/api/v1/portal), used when signed in
//   DemoDataSource  synthetic data held in the browser, for Demo Mode
//                   (arrives with the Review Studio)
// Screens must not call fetch() or the api helper directly, or Demo Mode
// would leak requests to the real API.
import { createContext, useContext } from 'react';
import type { Role, SsoProvider, Team, Vertical } from '../lib/types';

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
}

const Ctx = createContext<PortalDataSource | null>(null);
export const DataSourceProvider = Ctx.Provider;

export function useData(): PortalDataSource {
  const ds = useContext(Ctx);
  if (!ds) throw new Error('useData must be used inside <DataSourceProvider>');
  return ds;
}
