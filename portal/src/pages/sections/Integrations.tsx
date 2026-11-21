// Integrations: the systems MonkFlow connects for this workspace and how each
// is doing. Read-only: MonkFlow holds the credentials and records the status.
import { useQuery } from '@tanstack/react-query';
import { useSession } from '../../auth/session';
import { EmptyState, LoadError, Page, TableSkeleton } from '../../components/Page';
import { useData } from '../../data/PortalDataSource';
import { errorMessage } from '../../lib/api';
import { relativeTime } from '../../lib/format';
import type { Connection } from '../../lib/types';

const STATUS: Record<Connection['status'], [string, string]> = {
  healthy: ['pill pill-ok', 'Healthy'], attention: ['pill pill-warn', 'Needs attention'], down: ['pill pill-bad', 'Down'], planned: ['pill', 'Planned'],
};

export function Integrations() {
  const data = useData();
  const { session } = useSession();
  const q = useQuery({ queryKey: ['connections', session?.org?.id], queryFn: () => data.getConnections() });

  return (
    <Page title="Integrations" description="The systems your workflows read from and write to.">
      <section className="card" aria-labelledby="systems">
        <div className="card-head"><h2 id="systems">Connected systems</h2></div>
        {q.isPending && <TableSkeleton rows={3} cols={4} />}
        {q.isError && <div className="card-body"><LoadError message={errorMessage(q.error)} onRetry={() => void q.refetch()} /></div>}
        {q.data && !q.data.length && <EmptyState title="No systems connected yet">Each system in your engagement appears here once it is agreed, with its status.</EmptyState>}
        {q.data && q.data.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>System</th><th>Status</th><th>Last sync</th><th>Note</th></tr></thead>
              <tbody>
                {q.data.map((c) => (
                  <tr key={c.id}>
                    <td><strong>{c.system}</strong></td>
                    <td><span className={STATUS[c.status][0]}>{STATUS[c.status][1]}</span></td>
                    <td className="num" style={{ whiteSpace: 'nowrap' }}>{c.lastSyncAt ? relativeTime(c.lastSyncAt) : <span className="muted">Not yet</span>}</td>
                    <td className="muted">{c.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="card-body" style={{ borderTop: '1px solid var(--border)' }}>
          <p className="muted">MonkFlow holds the credentials for these connections; none are stored or shown in this portal. To add or change a system, use Requests or email <a href="mailto:nathan@monkflow.io">nathan@monkflow.io</a>.</p>
        </div>
      </section>
    </Page>
  );
}
