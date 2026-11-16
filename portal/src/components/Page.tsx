import type { ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';

export function Page({ title, description, actions, children }: { title: string; description?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <div className="page">
      <div className="page-head">
        <div><h1>{title}</h1>{description && <p>{description}</p>}</div>
        {actions && <div className="page-actions">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return <div className="empty"><h3>{title}</h3>{children && <p>{children}</p>}{action}</div>;
}

/** A failed load that leaves the rest of the page usable. */
export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="notice notice-bad" role="alert">
      <AlertCircle aria-hidden />
      <div style={{ flex: 1 }}>{message}</div>
      <button type="button" className="link-btn" onClick={onRetry}>Try again</button>
    </div>
  );
}

export function TableSkeleton({ rows = 4, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <table className="table" aria-busy="true">
      <tbody>
        {Array.from({ length: rows }, (_, r) => (
          <tr key={r}>{Array.from({ length: cols }, (_, c) => <td key={c}><span className="skeleton" style={{ height: 14, width: c === 0 ? '70%' : '50%' }} /></td>)}</tr>
        ))}
      </tbody>
    </table>
  );
}
