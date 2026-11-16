// /dashboard/workflows — the automations MonkFlow runs for this workspace.
// Read-only for clients: no run, pause, delete or edit here.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '../../auth/session';
import { EmptyState, LoadError, Page, TableSkeleton } from '../../components/Page';
import { PeriodSwitch } from '../../components/RunTiles';
import { useData } from '../../data/PortalDataSource';
import { errorMessage } from '../../lib/api';
import { count, percent, relativeTime } from '../../lib/format';
import type { PeriodDays } from '../../lib/types';
import { WorkflowStatusPill } from './status';
import '../../styles/console.css';

export function Workflows() {
  const data = useData();
  const { session } = useSession();
  const [days, setDays] = useState<PeriodDays>(30);
  const list = useQuery({ queryKey: ['workflows', session?.org?.id, days], queryFn: () => data.getWorkflows(days), placeholderData: (prev) => prev });

  return (
    <Page title="Workflows" description="The automations MonkFlow runs for your firm. To change one, tell us what you need and we will scope it."
      actions={list.data && list.data.length > 0 ? <PeriodSwitch value={days} onChange={setDays} /> : undefined}>
      <section className="card" aria-label="Workflows">
        {list.isPending && <TableSkeleton rows={3} cols={6} />}
        {list.isError && <div className="card-body"><LoadError message={errorMessage(list.error)} onRetry={() => void list.refetch()} /></div>}
        {list.data && list.data.length === 0 && (
          <EmptyState title="No workflows yet">Each workflow we build for {session?.org?.name} appears here with its status, recent runs and how it is performing.</EmptyState>
        )}
        {list.data && list.data.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Workflow</th><th>Status</th><th>Last run</th><th className="r">Runs, {days} days</th><th className="r">Failed</th><th className="r">Success rate</th></tr></thead>
              <tbody>
                {list.data.map((w) => (
                  <tr key={w.id}>
                    <td>
                      <Link className="row-link" to={w.id}>{w.name}</Link>
                      {w.description && <div className="muted" style={{ fontSize: 'var(--text-sm)', maxWidth: '60ch' }}>{w.description}</div>}
                    </td>
                    <td><WorkflowStatusPill status={w.status} /></td>
                    <td className="muted num">{w.lastRunAt ? relativeTime(w.lastRunAt) : 'No runs yet'}</td>
                    <td className="r num">{count(w.runs)}</td>
                    <td className="r num">{count(w.failed)}</td>
                    <td className="r num">{w.successRate === null ? <span className="muted">No finished runs</span> : percent(w.successRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </Page>
  );
}
