// Vault: every source document stored for this workspace. A file opens in
// the Review screen, where each view is permission-checked and logged.
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useSession } from '../../auth/session';
import { EmptyState, LoadError, Page, TableSkeleton } from '../../components/Page';
import { useData } from '../../data/PortalDataSource';
import { errorMessage } from '../../lib/api';
import { shortDate } from '../../lib/format';

const size = (bytes: number) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

export function Vault() {
  const data = useData();
  const { session } = useSession();
  const q = useQuery({ queryKey: ['vault', session?.org?.id], queryFn: () => data.getVault() });

  return (
    <Page title="Vault" description="The documents we hold for you: encrypted, and deleted at their retention date.">
      <section className="card" aria-labelledby="vault-docs">
        <div className="card-head"><h2 id="vault-docs">Stored documents{q.data ? <span className="muted num" style={{ fontWeight: 500 }}> · {q.data.length}</span> : null}</h2></div>
        {q.isPending && <TableSkeleton rows={4} cols={5} />}
        {q.isError && <div className="card-body"><LoadError message={errorMessage(q.error)} onRetry={() => void q.refetch()} /></div>}
        {q.data && !q.data.length && <EmptyState title="No documents stored">Files appear here as your workflows receive them.</EmptyState>}
        {q.data && q.data.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Document</th><th>Type</th><th>Size</th><th>Stored</th><th>Kept until</th></tr></thead>
              <tbody>
                {q.data.map((d) => (
                  <tr key={d.id}>
                    <td>
                      {d.available && d.reviewId ? <Link to={`../review/${d.reviewId}`}><strong>{d.title}</strong></Link> : <strong>{d.title}</strong>}
                      <div className="muted mono">{d.filename}</div>
                    </td>
                    <td>{d.typeLabel}</td>
                    <td className="num">{size(d.bytes)}</td>
                    <td className="num" style={{ whiteSpace: 'nowrap' }}>{shortDate(d.storedAt)}</td>
                    <td className="num" style={{ whiteSpace: 'nowrap' }}>
                      {d.available ? (d.deleteAfter ? shortDate(d.deleteAfter) : '') : <span className="pill">File deleted{d.deletedAt ? ` ${shortDate(d.deletedAt)}` : ''}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="card-body" style={{ borderTop: '1px solid var(--border)' }}>
          <p className="muted">Opening a document is recorded in your audit log. After a file is deleted, its reviewed figures remain in Review.</p>
        </div>
      </section>
    </Page>
  );
}
