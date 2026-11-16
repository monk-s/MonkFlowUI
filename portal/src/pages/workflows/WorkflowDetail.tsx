// /dashboard/workflows/:id — one workflow: what it does, how it is
// performing, and its recent runs.
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft } from 'lucide-react';
import { useSession } from '../../auth/session';
import { EmptyState, LoadError, Page, TableSkeleton } from '../../components/Page';
import { PeriodSwitch, RunTiles } from '../../components/RunTiles';
import { useData } from '../../data/PortalDataSource';
import { ApiError, errorMessage } from '../../lib/api';
import { dateTime, duration } from '../../lib/format';
import type { PeriodDays } from '../../lib/types';
import { NotFound } from '../NotFound';
import { RunStatusPill, TRIGGER, WorkflowStatusPill } from './status';
import '../../styles/console.css';

export function WorkflowDetail() {
  const { id = '' } = useParams();
  const data = useData();
  const { session } = useSession();
  const [days, setDays] = useState<PeriodDays>(30);
  const q = useQuery({
    queryKey: ['workflow', session?.org?.id, id, days], queryFn: () => data.getWorkflow(id, days), placeholderData: (prev) => prev,
    retry: (n, err) => !(err instanceof ApiError && err.status === 404) && n < 2,
  });

  if (q.error instanceof ApiError && q.error.status === 404) return <NotFound />;
  const w = q.data?.workflow;

  return (
    <Page title={w?.name ?? 'Workflow'}
      description={w ? <><WorkflowStatusPill status={w.status} /> <span style={{ marginLeft: 8 }}>{TRIGGER[w.trigger] ?? w.trigger}</span></> : undefined}
      actions={q.data ? <PeriodSwitch value={days} onChange={setDays} /> : undefined}>
      <Link className="back" to={`${data.base}/workflows`} style={{ order: -1 }}><ChevronLeft aria-hidden />All workflows</Link>
      {q.isPending && <div className="card"><TableSkeleton rows={4} cols={4} /></div>}
      {q.isError && <LoadError message={errorMessage(q.error)} onRetry={() => void q.refetch()} />}
      {q.data && w && (
        <>
          {w.description && <p style={{ maxWidth: '80ch', color: 'var(--ink-2)' }}>{w.description}</p>}
          <RunTiles days={q.data.days} totals={q.data.totals} series={q.data.series} saved={q.data.saved} />
          <section className="card" aria-labelledby="runs">
            <div className="card-head"><h2 id="runs">Recent runs</h2><span className="muted">Latest {q.data.runs.length === 50 ? '50' : q.data.runs.length}</span></div>
            {q.data.runs.length === 0 ? (
              <EmptyState title="No runs yet">Each time this workflow runs, it is listed here with its outcome and how long it took.</EmptyState>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Started</th><th>Outcome</th><th className="r">Duration</th><th>Detail</th></tr></thead>
                  <tbody>
                    {q.data.runs.map((r) => (
                      <tr key={r.id}>
                        <td className="num"><Link className="row-link" to={`runs/${r.id}`}>{dateTime(r.startedAt)}</Link></td>
                        <td><RunStatusPill status={r.status} /></td>
                        <td className="r num">{r.durationMs === null ? <span className="muted">In progress</span> : duration(r.durationMs)}</td>
                        <td className="muted" style={{ maxWidth: '48ch', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.error ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </Page>
  );
}
