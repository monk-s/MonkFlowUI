// Settings > Audit log: who did what in this workspace, newest first.
// Read-only. Shown to people who hold audit.view (admins and auditors).
import { useState } from 'react';
import { useInfiniteQuery, useMutation } from '@tanstack/react-query';
import { Download, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useSession } from '../../auth/session';
import { EmptyState, LoadError, TableSkeleton } from '../../components/Page';
import { useData } from '../../data/PortalDataSource';
import { errorMessage } from '../../lib/api';
import { NotFound } from '../NotFound';
import type { AuditFilter } from '../../lib/types';

const when = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' });

export function Audit() {
  const data = useData();
  const { session, can } = useSession();
  const [filter, setFilter] = useState<AuditFilter>({});
  const [error, setError] = useState('');
  const set = (patch: AuditFilter) => setFilter((f) => ({ ...f, ...patch }));

  const log = useInfiniteQuery({
    queryKey: ['audit', session?.org?.id, filter],
    queryFn: ({ pageParam }) => data.getAudit(filter, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
    enabled: can('audit.view'),
  });
  const download = useMutation({
    mutationFn: () => data.exportAudit(filter),
    onSuccess: ({ filename, blob }) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
      void log.refetch();   // the export is a new entry
    },
    onError: (err) => setError(errorMessage(err)),
  });

  if (!can('audit.view')) return <NotFound />;
  const entries = log.data?.pages.flatMap((p) => p.entries) ?? [];
  const chain = log.data?.pages[0]?.chain;

  return (
    <>
      {error && <div className="notice notice-bad" role="alert"><div style={{ flex: 1 }}>{error}</div><button type="button" className="link-btn" onClick={() => setError('')}>Dismiss</button></div>}
      {chain && (chain.ok
        ? <div className="notice notice-ok" role="status"><ShieldCheck aria-hidden /><div>Record intact. All <span className="num">{chain.entries}</span> entries were checked just now, and none has been changed or removed.</div></div>
        : <div className="notice notice-bad" role="alert"><ShieldAlert aria-hidden /><div>This log failed its integrity check: an entry has been changed or removed. Email <a href="mailto:nathan@monkflow.io">nathan@monkflow.io</a>.</div></div>)}

      <section className="card" aria-labelledby="audit-log">
        <div className="card-head">
          <h2 id="audit-log">Audit log</h2>
          <button type="button" className="btn" disabled={download.isPending} onClick={() => download.mutate()}><Download aria-hidden />Export CSV</button>
        </div>
        <div className="card-body" style={{ display: 'flex', gap: 'var(--s3)', flexWrap: 'wrap', alignItems: 'end' }}>
          <div className="field" style={{ flex: '1 1 220px' }}>
            <label htmlFor="audit-q">Person or action</label>
            <input id="audit-q" type="search" className="input" placeholder="Email, or an action such as review.approved" value={filter.q ?? ''} onChange={(e) => set({ q: e.target.value })} />
          </div>
          <div className="field"><label htmlFor="audit-from">From</label><input id="audit-from" type="date" className="input" value={filter.from ?? ''} onChange={(e) => set({ from: e.target.value })} /></div>
          <div className="field"><label htmlFor="audit-to">To</label><input id="audit-to" type="date" className="input" value={filter.to ?? ''} onChange={(e) => set({ to: e.target.value })} /></div>
        </div>
        {log.isPending && <TableSkeleton rows={6} cols={4} />}
        {log.isError && <div className="card-body"><LoadError message={errorMessage(log.error)} onRetry={() => void log.refetch()} /></div>}
        {log.data && !entries.length && <EmptyState title="No entries match">Clear the filters to see the whole log.</EmptyState>}
        {entries.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>When</th><th>Person</th><th>Action</th><th>Detail</th></tr></thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td className="num" style={{ whiteSpace: 'nowrap' }}>{when(e.at)}</td>
                    <td><div className="person"><span className="who"><strong>{e.actor}</strong>{e.actorEmail && <span>{e.actorEmail}</span>}</span></div></td>
                    <td className="mono">{e.action}</td>
                    <td className="muted" style={{ overflowWrap: 'anywhere' }}>{e.detail}{e.ip && <div className="hint">From {e.ip}</div>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {log.hasNextPage && <div className="card-body"><button type="button" className="btn" disabled={log.isFetchingNextPage} onClick={() => void log.fetchNextPage()}>Show older entries</button></div>}
      </section>
    </>
  );
}
