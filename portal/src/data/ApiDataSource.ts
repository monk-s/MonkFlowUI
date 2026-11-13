import { api } from '../lib/api';
import type { Team } from '../lib/types';
import type { MemberRole, PortalDataSource, WorkspaceSettings } from './PortalDataSource';

export class ApiDataSource implements PortalDataSource {
  readonly demo = false;

  async getWorkspace() {
    return (await api.get<{ workspace: WorkspaceSettings }>('/portal/workspace')).workspace;
  }

  getTeam() { return api.get<Team>('/portal/team'); }

  invite(email: string, role: MemberRole) {
    return api.post<{ emailSent: boolean }>('/portal/invitations', { email, role });
  }

  resendInvitation(id: string) {
    return api.post<{ emailSent: boolean }>(`/portal/invitations/${id}/resend`);
  }

  async revokeInvitation(id: string) { await api.del(`/portal/invitations/${id}`); }

  async updateMember(id: string, change: { role?: MemberRole; status?: 'active' | 'suspended' }) {
    await api.patch(`/portal/team/${id}`, change);
  }

  async removeMember(id: string) { await api.del(`/portal/team/${id}`); }
}
