// <base>/review — extracted documents waiting for a person, and what was
// decided about the ones before them.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '../../auth/session';
import { EmptyState, LoadError, Page, TableSkeleton } from '../../components/Page';
import { useData } from '../../data/PortalDataSource';
import { errorMessage } from '../../lib/api';
import { percent, relativeTime } from '../../lib/format';
import type { ReviewStatus, ReviewSummary } from '../../lib/types';
import { verticalPack } from '../../verticals';
import '../../styles/console.css';
import '../../styles/review.css';

const TABS: { status: ReviewStatus; label: string }[] = [
  { status: 'queued', label: 'Needs review' }, { status: 'approved', label: 'Approved' }, { status: 'rejected', label: 'Rejected' },
];

/** Quiet at 95% and above, "Check" from 80%, "Low" under 80%. */
export function ConfidenceChip({ value }: { value: number | null }) {
  if (value === null) return null;
  const level = value >= 0.95 ? 'ok' : value >= 0.8 ? 'check' : 'low';
  return <span className={`conf conf-${level}`} title={`Extraction confidence ${percent(value)}`}>{level === 'ok' ? percent(value) : level === 'check' ? 'Check' : 'Low'}</span>;
}

export function ReviewStatusPill({ item }: { item: ReviewSummary }) {
  if (item.status === 'approved') return <span className="pill pill-ok">Approved</span>;
  if (item.status === 'rejected') return <span className="pill pill-bad">Rejected</span>;
  return item.blocked ? <span className="pill pill-warn">Check failing</span> : <span className="pill pill-info">Needs review</span>;
}

export function Queue() {
  const data = useData();
  const { session } = useSession();
  const [status, setStatus] = useState<ReviewStatus>('queued');
  const q = useQuery({ queryKey: ['review', session?.org?.id, status], queryFn: () => data.getReviewList(status), placeholderData: (prev) => prev });
  const pack = verticalPack(session?.org?.vertical);
  const counts = q.data?.counts;

  return (
    <Page title="Review" description="Documents our workflows have read, waiting for a person to check them.">
      <section className="card">
        <div className="tabs" role="tablist" aria-label="Review status">
          {TABS.map((t) => (
            <button key={t.status} type="button" role="tab" aria-selected={status === t.status} onClick={() => setStatus(t.status)}>
              {t.label}{counts ? <span className="muted num"> · {counts[t.status]}</span> : null}
            </button>
          ))}
        </div>
        {q.isPending && <TableSkeleton rows={4} cols={6} />}
        {q.isError && <div className="card-body"><LoadError message={errorMessage(q.error)} onRetry={() => void q.refetch()} /></div>}
        {q.data && q.data.items.length === 0 && (status === 'queued'
          ? <EmptyState title={counts && counts.approved + counts.rejected > 0 ? 'Queue clear' : 'Nothing to review yet'}>
              {counts && counts.approved + counts.rejected > 0
                ? 'Every document has been decided. New ones appear here as they arrive.'
                : `When a workflow reads a document (${pack.documentsPhrase}), it is listed here with the extracted fields and its checks.`}
            </EmptyState>
          : <EmptyState title={`Nothing ${status} yet`} />)}
        {q.data && q.data.items.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Document</th><th>Type</th><th>Received</th><th className="r">To check</th><th>Lowest confidence</th><th>Checks</th><th>Status</th></tr></thead>
              <tbody>
                {q.data.items.map((i) => (
                  <tr key={i.id}>
                    <td><Link className="row-link" to={`${data.base}/review/${i.id}`}>{i.title}</Link>{i.subject && <div className="muted">{i.subject}{i.period ? ` · ${i.period}` : ''}</div>}</td>
                    <td>{i.templateLabel}</td>
                    <td className="muted num">{relativeTime(i.receivedAt)}</td>
                    <td className="r num">{i.flagged || <span className="muted">0</span>}</td>
                    <td><ConfidenceChip value={i.lowestConfidence} /></td>
                    <td className="num">{i.checksTotal === 0 ? <span className="muted">None</span> : `${i.checksPassed} of ${i.checksTotal} pass`}</td>
                    <td><ReviewStatusPill item={i} />{i.decidedByName && <div className="muted">{i.decidedByName}</div>}</td>
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
