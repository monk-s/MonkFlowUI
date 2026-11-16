// /dashboard/workflows/:id/runs/:runId — one run: outcome, timing, log.
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft } from 'lucide-react';
import { useSession } from '../../auth/session';
import { EmptyState, LoadError, Page, TableSkeleton } from '../../components/Page';
import { useData } from '../../data/PortalDataSource';
import { ApiError, errorMessage } from '../../lib/api';
import { duration } from '../../lib/format';
import { NotFound } from '../NotFound';
import { RunStatusPill, TRIGGER } from './status';
import '../../styles/console.css';

const stamp = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' });

export function RunDetail() {
  const { id = '', runId = '' } = useParams();
  const data = useData();
  const { session } = useSession();
  const q = useQuery({
    queryKey: ['run', session?.org?.id, id, runId], queryFn: () => data.getRun(id, runId),
    retry: (n, err) => !(err instanceof ApiError && err.status === 404) && n < 2,
  });

  if (q.error instanceof ApiError && q.error.status === 404) return <NotFound />;
  const run = q.data?.run;

  return (
    <Page title={run ? `Run of ${stamp(run.startedAt)}` : 'Run'} description={q.data?.workflow.name}>
      <Link className="back" to={`${data.base}/workflows/${id}`} style={{ order: -1 }}><ChevronLeft aria-hidden />{q.data?.workflow.name ?? 'Workflow'}</Link>
      {q.isPending && <div className="card"><TableSkeleton rows={4} cols={2} /></div>}
      {q.isError && <LoadError message={errorMessage(q.error)} onRetry={() => void q.refetch()} />}
      {q.data && run && (
        <>
          {run.status === 'failed' && (
            <div className="notice notice-bad" role="status"><div><strong>This run failed.</strong> {run.error ?? 'No error message was recorded.'}</div></div>
          )}
          <section className="card" aria-label="Run summary">
            <dl className="dl">
              <div><dt>Outcome</dt><dd><RunStatusPill status={run.status} /></dd></div>
              <div><dt>Started</dt><dd className="num">{stamp(run.startedAt)}</dd></div>
              <div><dt>Finished</dt><dd className="num">{run.completedAt ? stamp(run.completedAt) : 'Still in progress'}</dd></div>
              <div><dt>Duration</dt><dd className="num">{run.durationMs === null ? 'Not finished' : duration(run.durationMs)}</dd></div>
              <div><dt>Started by</dt><dd>{TRIGGER[run.trigger] ?? run.trigger}</dd></div>
              <div><dt>Run ID</dt><dd className="mono">{run.id}</dd></div>
            </dl>
          </section>
          <section className="card" aria-labelledby="log">
            <div className="card-head"><h2 id="log">Log</h2>{q.data.logs.length === 500 && <span className="muted">First 500 lines</span>}</div>
            {q.data.logs.length === 0
              ? <EmptyState title="No log lines for this run">Steps a workflow reports while it runs are listed here.</EmptyState>
              : (
                <ol className="log">
                  {q.data.logs.map((l) => (
                    <li key={l.id} data-level={l.level}>
                      <time dateTime={l.at}>{new Date(l.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}</time>
                      <span className="lvl">{l.level}</span>
                      <span className="msg">{l.message}</span>
                    </li>
                  ))}
                </ol>
              )}
          </section>
        </>
      )}
    </Page>
  );
}
