// Requests: what this workspace has asked MonkFlow for, and what MonkFlow has
// asked of it. Admins and reviewers can ask; everyone can read.
import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Dialog from '@radix-ui/react-dialog';
import { Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useSession } from '../../auth/session';
import { EmptyState, LoadError, Page, TableSkeleton } from '../../components/Page';
import { useData } from '../../data/PortalDataSource';
import { errorMessage } from '../../lib/api';
import { calendarDate, shortDate } from '../../lib/format';
import type { PortalRequest } from '../../lib/types';

const STATUS = { open: ['pill pill-info', 'Open'], done: ['pill pill-ok', 'Closed'], withdrawn: ['pill', 'Withdrawn'] } as const;
const Status = ({ r, openLabel = 'Open' }: { r: PortalRequest; openLabel?: string }) => <span className={STATUS[r.status][0]}>{r.status === 'open' ? openLabel : STATUS[r.status][1]}</span>;

export function Requests() {
  const data = useData();
  const { session } = useSession();
  const queryClient = useQueryClient();
  const key = ['requests', session?.org?.id];
  const q = useQuery({ queryKey: key, queryFn: () => data.getRequests() });
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [error, setError] = useState('');
  const refresh = () => queryClient.invalidateQueries({ queryKey: key });

  const create = useMutation({
    mutationFn: () => data.createRequest({ title: title.trim(), detail: detail.trim() }),
    onSuccess: () => { setOpen(false); setTitle(''); setDetail(''); setError(''); void refresh(); },
    onError: (err) => setError(errorMessage(err)),
  });
  const withdraw = useMutation({ mutationFn: (id: string) => data.withdrawRequest(id), onSuccess: () => void refresh(), onError: (err) => setError(errorMessage(err)) });
  const submit = (e: FormEvent) => { e.preventDefault(); if (title.trim().length >= 2) create.mutate(); };

  return (
    <Page title="Requests" description="Ask for a change or a new workflow, and see what we have asked of you."
      actions={q.data?.canCreate && <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}><Plus aria-hidden />New request</button>}>
      {error && !open && <div className="notice notice-bad" role="alert"><div style={{ flex: 1 }}>{error}</div><button type="button" className="link-btn" onClick={() => setError('')}>Dismiss</button></div>}

      <section className="card" aria-labelledby="req-sent">
        <div className="card-head"><h2 id="req-sent">Your requests to MonkFlow</h2></div>
        {q.isPending && <TableSkeleton rows={3} cols={4} />}
        {q.isError && <div className="card-body"><LoadError message={errorMessage(q.error)} onRetry={() => void q.refetch()} /></div>}
        {q.data && !q.data.sent.length && <EmptyState title="Nothing asked yet">Describe a bottleneck or a change you want. The person doing the work reads every request and replies here.</EmptyState>}
        {q.data && q.data.sent.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Request</th><th>Asked by</th><th>Asked</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {q.data.sent.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.title}</strong>
                      {r.detail && <div className="muted" style={{ whiteSpace: 'pre-wrap' }}>{r.detail}</div>}
                      {r.reply && <div style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}><span className="tag" style={{ marginRight: 6 }}>Reply</span>{r.reply}</div>}
                    </td>
                    <td>{r.requestedByName}</td>
                    <td className="num" style={{ whiteSpace: 'nowrap' }}>{shortDate(r.createdAt)}</td>
                    <td><Status r={r} />{r.closedAt && <div className="muted num">{shortDate(r.closedAt)}</div>}</td>
                    <td style={{ textAlign: 'right' }}>{r.status === 'open' && q.data.canCreate && <button type="button" className="link-btn" disabled={withdraw.isPending} onClick={() => withdraw.mutate(r.id)}>Withdraw</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card" aria-labelledby="req-received">
        <div className="card-head"><h2 id="req-received">MonkFlow's requests to you</h2></div>
        {q.data && !q.data.received.length && <EmptyState title="Nothing waiting on you" />}
        {q.data && q.data.received.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Request</th><th>Due</th><th>Status</th></tr></thead>
              <tbody>
                {q.data.received.map((r) => (
                  <tr key={r.id}>
                    <td><strong>{r.title}</strong>{r.detail && <div className="muted">{r.detail}</div>}</td>
                    <td className="num" style={{ whiteSpace: 'nowrap' }}>{r.dueOn ? calendarDate(r.dueOn) : ''}</td>
                    <td><Status r={r} openLabel="Waiting on you" />{r.closedByName && <div className="muted">{r.closedByName}</div>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {q.data && q.data.received.some((r) => r.status === 'open') && <div className="card-body"><p className="muted">Mark these done from <Link to="..">Overview</Link>.</p></div>}
      </section>

      <Dialog.Root open={open} onOpenChange={(v) => { setOpen(v); setError(''); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog">
            <Dialog.Title>New request</Dialog.Title>
            <Dialog.Description className="dialog-desc">This goes to the person doing the work. Do not include passwords or keys.</Dialog.Description>
            <form className="dialog-body" onSubmit={submit} noValidate>
              {error && <div className="notice notice-bad" role="alert">{error}</div>}
              <div className="field">
                <label htmlFor="req-title">What do you need?</label>
                <input id="req-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} autoFocus required />
              </div>
              <div className="field">
                <label htmlFor="req-detail">Detail (optional)</label>
                <textarea id="req-detail" className="input" rows={5} value={detail} onChange={(e) => setDetail(e.target.value)} maxLength={4000} />
              </div>
              <div className="dialog-actions">
                <Dialog.Close className="btn">Cancel</Dialog.Close>
                <button type="submit" className="btn btn-primary" disabled={create.isPending || title.trim().length < 2}>Send request</button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </Page>
  );
}
