// <base>/review/:id — one extracted document: the source on the left, the
// fields, checks and audit trail on the right, the decision at the bottom.
//
// Selecting a field shows where it came from: the PDF jumps to its page; a
// synthetic demo document highlights the exact cell. Edits save one field at
// a time and the checks come back re-run.
//
// shortcut: PDFs use the browser's own viewer in a frame, which can jump to a
// page but cannot highlight a region. Swap in pdf.js when pipelines send
// field boxes.
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Dialog from '@radix-ui/react-dialog';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useSession } from '../../auth/session';
import { LoadError, Page, TableSkeleton } from '../../components/Page';
import { useData } from '../../data/PortalDataSource';
import { ApiError, errorMessage } from '../../lib/api';
import { dateTime, shortDate } from '../../lib/format';
import type { ReviewDocument, ReviewField, ReviewItem } from '../../lib/types';
import { NotFound } from '../NotFound';
import { ConfidenceChip, ReviewStatusPill } from './Queue';
import '../../styles/console.css';
import '../../styles/review.css';

const TRAIL: Record<string, (m: Record<string, unknown>) => string> = {
  'review.received': (m) => `Received with ${m.fields} extracted fields`,
  'review.fields_edited': (m) => `Corrected ${Array.isArray(m.fields) ? m.fields.join('; ') : 'fields'}`,
  'review.approved': (m) => (m.reason ? `Approved over a failing check: ${m.reason}` : 'Approved'),
  'review.rejected': (m) => `Rejected: ${m.reason}`,
  'review.exported': (m) => `Exported as ${String(m.format).toUpperCase()}`,
};

function DocumentPane({ doc, item, field, onPick }: { doc: ReviewDocument | null; item: ReviewItem; field: ReviewField | null; onPick: (id: string) => void }) {
  if (!doc) {
    return (
      <div className="empty">
        <h3>{item.document === 'purged' ? 'The source file has been deleted' : 'No source file'}</h3>
        <p>{item.document === 'purged'
          ? `It was removed at the end of its retention period${item.documentPurgeAfter ? ` (${shortDate(item.documentPurgeAfter)})` : ''}. The reviewed fields are kept.`
          : 'This document arrived as extracted fields only.'}</p>
      </div>
    );
  }
  if (doc.kind === 'pdf') {
    const page = field?.page ?? 1;
    // Re-created per page: the built-in viewer only reads #page when it loads.
    return <iframe key={page} src={`${doc.url}#page=${page}&navpanes=0`} title={`Source document: ${item.documentName ?? item.title}`} />;
  }
  return (
    <div className="pages">
      {doc.pages.map((p) => (
        <div key={p.page} className="sheet">
          <span className="pg">Page {p.page}</span>
          <h3>{p.heading}</h3>
          <table>
            <tbody>
              {p.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td key={c} data-field={cell.fieldId} data-on={!!cell.fieldId && cell.fieldId === field?.id}
                      ref={cell.fieldId && cell.fieldId === field?.id ? (el) => el?.scrollIntoView({ block: 'nearest' }) : undefined}
                      onClick={cell.fieldId ? () => onPick(cell.fieldId!) : undefined}>{cell.text}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function Value({ field, on, editable, busy, onPick, onSave }: { field: ReviewField; on: boolean; editable: boolean; busy: boolean; onPick: () => void; onSave: (value: string) => void }) {
  const [editing, setEditing] = useState(false);
  const flag = field.editedAt || field.confidence === null || field.confidence >= 0.95 ? undefined : field.confidence >= 0.8 ? 'check' : 'low';
  if (editing) {
    return (
      <input className="fval-input" autoFocus defaultValue={field.value} aria-label={`${field.label}${field.row !== null ? `, row ${field.row + 1}` : ''}`}
        onBlur={(e) => { setEditing(false); if (e.target.value.trim() !== field.value) onSave(e.target.value); }}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { e.currentTarget.value = field.value; e.currentTarget.blur(); } }} />
    );
  }
  return (
    <button type="button" className="fval" data-flag={flag} data-on={on} disabled={busy}
      aria-label={`${field.label}${field.row !== null ? `, row ${field.row + 1}` : ''}: ${field.value || 'empty'}${flag ? `, ${flag === 'low' ? 'low' : 'medium'} confidence` : ''}`}
      title={field.editedAt ? `Changed by ${field.editedByName} on ${dateTime(field.editedAt)}` : editable ? 'Click to select; click again to edit' : undefined}
      onClick={() => { if (on && editable) setEditing(true); else onPick(); }}>
      {field.value || <span className="muted">(empty)</span>}
      {field.original !== null && <s>{field.original || '(empty)'}</s>}
    </button>
  );
}

export function Studio() {
  const { id = '' } = useParams();
  const data = useData();
  const { session } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const orgId = session?.org?.id;
  const [tab, setTab] = useState<'fields' | 'checks' | 'audit'>('fields');
  const [picked, setPicked] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'approve' | 'reject' | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const q = useQuery({
    queryKey: ['review-item', orgId, id], queryFn: () => data.getReviewItem(id),
    retry: (n, err) => !(err instanceof ApiError && err.status === 404) && n < 2,
  });
  const queue = useQuery({ queryKey: ['review', orgId, 'queued'], queryFn: () => data.getReviewList('queued') });

  const adopt = (item: ReviewItem) => {
    queryClient.setQueryData(['review-item', orgId, id], item);
    void queryClient.invalidateQueries({ queryKey: ['review', orgId] });
  };
  const edit = useMutation({
    mutationFn: (e: { id: string; value: string }) => data.editReviewFields(id, [e]),
    onSuccess: (item) => { setError(''); adopt(item); },
    onError: (err) => setError(errorMessage(err)),
  });
  const ids = (queue.data?.items ?? []).map((i) => i.id);
  const position = ids.indexOf(id);
  const decide = useMutation({
    mutationFn: (kind: 'approve' | 'reject') => (kind === 'approve' ? data.approveReview(id, reason.trim() || undefined) : data.rejectReview(id, reason.trim())),
    onSuccess: (item) => {
      adopt(item);
      setDialog(null); setReason(''); setError('');
      // Straight on to the next document in the queue, if there is one.
      const next = ids[position + 1] ?? ids.find((other) => other !== id);
      if (next) { setPicked(null); navigate(`${data.base}/review/${next}`); }
    },
    onError: (err) => setError(errorMessage(err)),
  });
  const download = useMutation({
    mutationFn: (format: 'csv' | 'json') => data.exportReview(id, format),
    onSuccess: ({ filename, blob }) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
      void queryClient.invalidateQueries({ queryKey: ['review-item', orgId, id] });
    },
    onError: (err) => setError(errorMessage(err)),
  });

  if (q.error instanceof ApiError && q.error.status === 404) return <NotFound />;
  const item = q.data;
  const field = item?.fields.find((f) => f.id === picked) ?? null;
  const failing = item?.checks.filter((c) => c.status === 'fail') ?? [];
  const blocking = failing.filter((c) => c.blocking);
  const needsReason = dialog === 'reject' || blocking.length > 0;
  const go = (to: string | undefined) => { if (to) { setPicked(null); navigate(`${data.base}/review/${to}`); } };

  const value = (f: ReviewField) => (
    <Value key={f.id + f.value} field={f} on={f.id === picked} editable={!!item?.canDecide} busy={edit.isPending}
      onPick={() => setPicked(f.id)} onSave={(v) => edit.mutate({ id: f.id, value: v })} />
  );

  return (
    <Page title={item?.title ?? 'Document'}
      description={item ? <><ReviewStatusPill item={item} /> <span style={{ marginLeft: 8 }}>{[item.templateLabel, item.subject, item.period].filter(Boolean).join(' · ')}</span></> : undefined}
      actions={position >= 0 ? (
        <div className="studio-nav">
          <span className="num">{position + 1} of {ids.length} to review</span>
          <button type="button" className="btn btn-icon" aria-label="Previous document" disabled={position === 0} onClick={() => go(ids[position - 1])}><ChevronLeft aria-hidden /></button>
          <button type="button" className="btn btn-icon" aria-label="Next document" disabled={position === ids.length - 1} onClick={() => go(ids[position + 1])}><ChevronRight aria-hidden /></button>
        </div>
      ) : undefined}>
      <Link className="back" to={`${data.base}/review`} style={{ order: -1 }}><ChevronLeft aria-hidden />Review queue</Link>
      {q.isPending && <div className="card"><TableSkeleton rows={8} cols={3} /></div>}
      {q.isError && <LoadError message={errorMessage(q.error)} onRetry={() => void q.refetch()} />}
      {error && !dialog && <div className="notice notice-bad" role="alert"><div style={{ flex: 1 }}>{error}</div><button type="button" className="link-btn" onClick={() => setError('')}>Dismiss</button></div>}
      {item && (
        <>
          {item.status !== 'queued' && (
            <div className={`notice notice-${item.status === 'approved' ? 'ok' : 'bad'}`} role="status">
              <div>{item.status === 'approved' ? 'Approved' : 'Rejected'} by {item.decidedByName}{item.decidedAt ? ` on ${dateTime(item.decidedAt)}` : ''}.{item.decisionReason ? ` Reason given: ${item.decisionReason}` : ''}</div>
            </div>
          )}
          <div className="studio">
            <section className="card studio-doc" aria-label="Source document">
              <DocumentPane doc={data.reviewDocument(item)} item={item} field={field} onPick={(fid) => { setTab('fields'); setPicked(fid); }} />
            </section>

            <section className="card" aria-label="Extracted data">
              <div className="tabs" role="tablist">
                <button type="button" role="tab" aria-selected={tab === 'fields'} onClick={() => setTab('fields')}>Fields{item.flagged > 0 && <span className="muted num"> · {item.flagged} to check</span>}</button>
                <button type="button" role="tab" aria-selected={tab === 'checks'} onClick={() => setTab('checks')}>
                  Checks <span className={`num ${failing.length ? 'bad' : 'muted'}`}>{item.checksPassed}/{item.checksTotal}</span>
                </button>
                <button type="button" role="tab" aria-selected={tab === 'audit'} onClick={() => setTab('audit')}>Audit</button>
              </div>

              {tab === 'fields' && item.groups.map((g) => {
                const fields = item.fields.filter((f) => f.group === g.key);
                if (!fields.length) return null;
                const singles = fields.filter((f) => f.row === null);
                const rows = [...new Set(fields.filter((f) => f.row !== null).map((f) => f.row as number))].sort((a, b) => a - b);
                const cols = fields.filter((f) => f.row === rows[0]);
                return (
                  <div key={g.key} className="fgroup">
                    <h3>{g.label}{rows.length > 0 && <span className="num"> · {rows.length} rows</span>}</h3>
                    {singles.map((f) => (
                      <div key={f.id} className="frow" data-on={f.id === picked}>
                        <span>{f.label}</span>{value(f)}<ConfidenceChip value={f.editedAt ? null : f.confidence} /><span className="pgno">{f.page !== null ? `p.${f.page}` : ''}</span>
                      </div>
                    ))}
                    {rows.length > 0 && (
                      <div className="table-wrap">
                        <table className="ftable">
                          <thead><tr><th>#</th>{cols.map((c) => <th key={c.key}>{c.label}</th>)}</tr></thead>
                          <tbody>
                            {rows.map((r) => (
                              <tr key={r}>
                                <td className="num">{r + 1}</td>
                                {cols.map((c) => { const f = fields.find((x) => x.row === r && x.key === c.key); return <td key={c.key} data-on={!!f && f.id === picked}>{f ? value(f) : null}</td>; })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}

              {tab === 'checks' && (item.checks.length === 0
                ? <div className="empty"><p>This document type has no reconciliation checks.</p></div>
                : (
                  <ul className="checks">
                    {item.checks.map((c) => (
                      <li key={c.id}>
                        <span className={`pill ${c.status === 'pass' ? 'pill-ok' : c.status === 'fail' ? 'pill-bad' : ''}`}>{c.status === 'pass' ? 'Pass' : c.status === 'fail' ? 'Fail' : 'Not run'}</span>
                        <div><strong>{c.label}</strong><span className="detail">{c.detail}{c.status === 'fail' && c.blocking ? ' Approval needs this fixed, or a written reason.' : ''}</span></div>
                      </li>
                    ))}
                  </ul>
                ))}

              {tab === 'audit' && (
                <ul className="activity">
                  {item.trail.map((t) => (
                    <li key={t.id}><div className="what">{(TRAIL[t.action] ?? (() => t.action))(t.metadata)}<span>{t.actor}</span></div><time dateTime={t.at}>{dateTime(t.at)}</time></li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <div className="studio-bar">
            {item.canDecide && <button type="button" className="btn btn-danger" onClick={() => { setReason(''); setError(''); setDialog('reject'); }}>Reject…</button>}
            <span className="grow" />
            <button type="button" className="btn" disabled={download.isPending} onClick={() => download.mutate('csv')}>Export CSV</button>
            <button type="button" className="btn" disabled={download.isPending} onClick={() => download.mutate('json')}>Export JSON</button>
            {item.canDecide && (
              <button type="button" className="btn btn-primary" disabled={decide.isPending}
                onClick={() => { setReason(''); setError(''); if (blocking.length) setDialog('approve'); else decide.mutate('approve'); }}>
                {decide.isPending ? 'Saving…' : 'Approve'}
              </button>
            )}
          </div>

          <Dialog.Root open={!!dialog} onOpenChange={(v) => { if (!v && !decide.isPending) setDialog(null); }}>
            <Dialog.Portal>
              <Dialog.Overlay className="dialog-overlay" />
              <Dialog.Content className="dialog">
                <Dialog.Title>{dialog === 'reject' ? 'Reject this document?' : 'Approve with a failing check?'}</Dialog.Title>
                <Dialog.Description className="dialog-desc">
                  {dialog === 'reject'
                    ? 'It leaves the queue and nothing downstream uses it. Your reason is recorded with your name.'
                    : `${blocking.map((c) => c.label).join('; ')}. To approve anyway, say why. The reason is recorded with your name in the audit log.`}
                </Dialog.Description>
                {needsReason && (
                  <div className="field" style={{ marginTop: 'var(--s3)' }}>
                    <label htmlFor="reason">Reason</label>
                    <textarea id="reason" className="input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
                  </div>
                )}
                {error && <div className="notice notice-bad" role="alert" style={{ marginTop: 'var(--s3)' }}><div>{error}</div></div>}
                <div className="dialog-actions">
                  <Dialog.Close className="btn" disabled={decide.isPending}>Cancel</Dialog.Close>
                  <button type="button" className={`btn ${dialog === 'reject' ? 'btn-danger' : 'btn-primary'}`}
                    disabled={decide.isPending || reason.trim().length < (dialog === 'reject' ? 3 : 10)} onClick={() => dialog && decide.mutate(dialog)}>
                    {decide.isPending ? 'Saving…' : dialog === 'reject' ? 'Reject' : 'Approve anyway'}
                  </button>
                </div>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </>
      )}
    </Page>
  );
}
