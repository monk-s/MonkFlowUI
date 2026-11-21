import { api } from '../lib/api';
import type {
  ActionItem, ActivityEntry, AuditFilter, AuditPage, Connection, Requests, VaultDocument, Engagement, PeriodDays, ReviewItem, ReviewList, ReviewStatus, RunDetail, Team, Telemetry, WorkflowDetail, WorkflowRow,
} from '../lib/types';
import type { MemberRole, PortalDataSource, WorkspaceSettings } from './PortalDataSource';

const auditQuery = (f: AuditFilter, before?: string) =>
  new URLSearchParams(Object.entries({ ...f, before }).filter((e): e is [string, string] => !!e[1])).toString();

export class ApiDataSource implements PortalDataSource {
  readonly demo = false;
  readonly base = '/dashboard';

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

  getReviewList(status?: ReviewStatus) { return api.get<ReviewList>(`/portal/review${status ? `?status=${status}` : ''}`); }
  async getReviewItem(id: string) { return (await api.get<{ item: ReviewItem }>(`/portal/review/${id}`)).item; }
  reviewDocument(item: ReviewItem) {
    return item.document === 'available' ? { kind: 'pdf' as const, url: `/api/v1/portal/review/${item.id}/document` } : null;
  }
  async editReviewFields(id: string, edits: { id: string; value: string }[]) {
    return (await api.patch<{ item: ReviewItem }>(`/portal/review/${id}/fields`, { edits })).item;
  }
  async approveReview(id: string, reason?: string) { return (await api.post<{ item: ReviewItem }>(`/portal/review/${id}/approve`, { reason })).item; }
  async rejectReview(id: string, reason: string) { return (await api.post<{ item: ReviewItem }>(`/portal/review/${id}/reject`, { reason })).item; }
  exportReview(id: string, format: 'csv' | 'json') { return api.download(`/portal/review/${id}/export?format=${format}`); }

  getRequests() { return api.get<Requests>('/portal/requests'); }
  async createRequest(input: { title: string; detail: string }) { await api.post('/portal/requests', input); }
  async withdrawRequest(id: string) { await api.post(`/portal/requests/${id}/withdraw`); }
  async getVault() { return (await api.get<{ documents: VaultDocument[] }>('/portal/vault')).documents; }
  async getConnections() { return (await api.get<{ connections: Connection[] }>('/portal/connections')).connections; }

  getAudit(filter: AuditFilter, before?: string) { return api.get<AuditPage>(`/portal/audit?${auditQuery(filter, before)}`); }
  exportAudit(filter: AuditFilter) { return api.download(`/portal/audit/export?${auditQuery(filter)}`); }
}
