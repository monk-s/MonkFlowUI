// K-1 season for a family office: the tracker (one row per expected K-1) and
// the hand-off to the outside accountant. A K-1 itself opens in the Review
// screen. Only workspaces whose data source has getK1Tracker see these pages;
// today that is the family-office demo.
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '../../auth/session';
import { LoadError, Page, TableSkeleton } from '../../components/Page';
import { useData } from '../../data/PortalDataSource';
import { errorMessage } from '../../lib/api';
import { calendarDate } from '../../lib/format';
import { K1_STATUSES, type K1Export, type K1TrackerRow } from '../../lib/types';
import { NotFound } from '../NotFound';

const day = (ymd: string) => calendarDate(ymd, { month: 'short', day: 'numeric' });
const PILL: Record<string, string> = { Approved: 'pill-ok', 'Sent to accountant': 'pill-ok', 'In review': 'pill-warn', 'Final received': 'pill-warn' };

function useK1() {
  const data = useData();
  const { session } = useSession();
  const queryClient = useQueryClient();
  const key = ['k1', session?.org?.id];
  const q = useQuery({ queryKey: key, queryFn: () => data.getK1Tracker!(), enabled: !!data.getK1Tracker });
  const download = useMutation({
    mutationFn: (kind: K1Export) => data.exportK1s!(kind),
    onSuccess: ({ filename, blob }) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    },
  });
  return { data, q, download, refresh: () => queryClient.invalidateQueries({ queryKey: key }) };
}

export function K1Tracker() {
  const { data, q, download, refresh } = useK1();
  const [entity, setEntity] = useState('');
  const [status, setStatus] = useState('');
  const [flagged, setFlagged] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const upload = useMutation({ mutationFn: (name: string) => data.uploadK1!(name), onSuccess: refresh });
  if (!data.getK1Tracker) return <NotFound />;

  const rows = q.data?.rows ?? [];
  const shown = rows.filter((r) => (!entity || r.entity === entity) && (!status || r.status === status) && (!flagged || r.openFlags > 0));
  const late = rows.filter((r) => r.daysLate > 0).length;

  return (
    <Page title="K-1 tracker"
      description={q.data ? `${q.data.office} · tax year ${q.data.taxYear} · as of ${calendarDate(q.data.today)}` : undefined}
      actions={(
        <div style={{ display: 'flex', gap: 'var(--s2)' }}>
          <input ref={file} type="file" accept="application/pdf" hidden aria-label="K-1 file to upload"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) upload.mutate(f.name); e.target.value = ''; }} />
          <button type="button" className="btn" onClick={() => file.current?.click()}>Upload a K-1</button>
          <button type="button" className="btn" disabled={download.isPending} onClick={() => download.mutate('outstanding')}>Export outstanding list</button>
        </div>
      )}>
      {q.isPending && <div className="card"><TableSkeleton rows={8} cols={8} /></div>}
      {q.isError && <LoadError message={errorMessage(q.error)} onRetry={() => void q.refetch()} />}
      {q.data && (
        <>
          <div className="k1-strip" role="group" aria-label="K-1s by status">
            {K1_STATUSES.map((s) => (
              <button key={s} type="button" className="k1-count" aria-pressed={status === s} onClick={() => setStatus(status === s ? '' : s)}>
                <span className="num">{rows.filter((r) => r.status === s).length}</span>{s}
              </button>
            ))}
            <div className="k1-count k1-late" data-none={late === 0}><span className="num">{late}</span>Outstanding past expected date</div>
          </div>

          <section className="card" aria-label="Expected K-1s">
            <div className="card-head k1-filters">
              <label>Entity <select className="input" value={entity} onChange={(e) => setEntity(e.target.value)}>
                <option value="">All entities</option>{[...new Set(rows.map((r) => r.entity))].map((e) => <option key={e}>{e}</option>)}
              </select></label>
              <label>Status <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">All statuses</option>{K1_STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select></label>
              <label className="check"><input type="checkbox" checked={flagged} onChange={(e) => setFlagged(e.target.checked)} /> Has open flags</label>
              <span className="muted num" style={{ marginLeft: 'auto' }}>{shown.length} of {rows.length}</span>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Investment</th><th>Investing entity</th><th>Type</th><th>Status</th><th>Expected</th><th>Days late</th><th>Open flags</th><th>Last action</th><th /></tr></thead>
                <tbody>
                  {shown.map((r: K1TrackerRow) => (
                    <tr key={r.id}>
                      <td><strong>{r.investment}</strong></td>
                      <td>{r.entity}</td>
                      <td>{r.type}</td>
                      <td><span className={`pill ${PILL[r.status] ?? ''}`}>{r.status}</span></td>
                      <td className="num" style={{ whiteSpace: 'nowrap' }}>{day(r.expected)}</td>
                      <td className="num">{r.daysLate > 0 ? <span className="bad">{r.daysLate}</span> : ''}</td>
                      <td className="num">{r.openFlags > 0 ? <span className="pill pill-bad">{r.openFlags}</span> : ''}</td>
                      <td>{r.lastAction}<div className="muted num">{day(r.lastActionOn)}</div></td>
                      <td style={{ whiteSpace: 'nowrap' }}>{r.reviewId && <Link to={`../review/${r.reviewId}`} aria-label={`${r.status === 'Approved' || r.status === 'Sent to accountant' ? 'Open' : 'Review'} ${r.investment}`}>{r.status === 'Approved' || r.status === 'Sent to accountant' ? 'Open' : 'Review'}</Link>}</td>
                    </tr>
                  ))}
                  {!shown.length && <tr><td colSpan={9} className="muted">No K-1 matches these filters.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </Page>
  );
}

export function K1Handoff() {
  const { data, q, download, refresh } = useK1();
  const send = useMutation({ mutationFn: () => data.sendK1sToAccountant!(), onSuccess: refresh });
  if (!data.getK1Tracker) return <NotFound />;
  const rows = q.data?.rows ?? [];
  const approved = rows.filter((r) => r.status === 'Approved');
  const sent = rows.filter((r) => r.status === 'Sent to accountant');
  const files: { kind: K1Export; title: string; text: string }[] = [
    { kind: 'figures', title: 'Approved figures', text: 'One row per box of every approved K-1: entity, investment, tax year, box, code, amount, who approved it and when.' },
    { kind: 'exceptions', title: 'Exception report', text: 'Every flag raised on a K-1 that has been read, with the note explaining why it was accepted.' },
    { kind: 'outstanding', title: 'Outstanding list', text: 'K-1s not yet received in final form, with the expected date and the last action taken.' },
  ];

  return (
    <Page title="Accountant export" description="What goes to the outside accountant. Files are CSV, which opens in Excel.">
      {q.isError && <LoadError message={errorMessage(q.error)} onRetry={() => void q.refetch()} />}
      <div className="k1-files">
        {files.map((f) => (
          <section key={f.kind} className="card"><div className="card-body">
            <h2>{f.title}</h2><p className="muted">{f.text}</p>
            <button type="button" className="btn" disabled={download.isPending} onClick={() => download.mutate(f.kind)}>Download {f.title.toLowerCase()}</button>
          </div></section>
        ))}
      </div>
      <section className="card" aria-label="Approved K-1s">
        <div className="card-head">
          <h2>Ready to send<span className="muted num" style={{ fontWeight: 500 }}> · {approved.length}</span></h2>
          <button type="button" className="btn btn-primary" disabled={!approved.length || send.isPending} onClick={() => send.mutate()}>Mark as sent to accountant</button>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Investment</th><th>Investing entity</th><th>Status</th><th>Last action</th></tr></thead>
            <tbody>
              {[...approved, ...sent].map((r) => (
                <tr key={r.id}><td><strong>{r.investment}</strong></td><td>{r.entity}</td><td><span className="pill pill-ok">{r.status}</span></td><td>{r.lastAction}</td></tr>
              ))}
              {!approved.length && !sent.length && <tr><td colSpan={4} className="muted">No K-1 has been approved yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </Page>
  );
}
