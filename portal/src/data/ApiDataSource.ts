import { api } from '../lib/api';
import type { ActionItem, ActivityEntry, Engagement, PeriodDays, RunDetail, Team, Telemetry, WorkflowDetail, WorkflowRow } from '../lib/types';
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

  async getActions() { return (await api.get<{ actions: ActionItem[] }>('/portal/actions')).actions; }
  async completeAction(id: string) { await api.post(`/portal/actions/${id}/complete`); }
  async getEngagements() { return (await api.get<{ engagements: Engagement[] }>('/portal/engagements')).engagements; }
  async signOffMilestone(id: string) { await api.post(`/portal/milestones/${id}/sign-off`); }
  async getActivity() { return (await api.get<{ activity: ActivityEntry[] }>('/portal/activity')).activity; }

  getTelemetry(days: PeriodDays) { return api.get<Telemetry>(`/portal/telemetry?days=${days}`); }
  async getWorkflows(days: PeriodDays) { return (await api.get<{ workflows: WorkflowRow[] }>(`/portal/workflows?days=${days}`)).workflows; }
  getWorkflow(id: string, days: PeriodDays) { return api.get<WorkflowDetail>(`/portal/workflows/${id}?days=${days}`); }
  getRun(workflowId: string, runId: string) { return api.get<RunDetail>(`/portal/workflows/${workflowId}/runs/${runId}`); }
}
