// One thing waiting on the client: a kind tag, a one-line ask, a due date
// and a single primary button. People whose role cannot act see who can.
import { dueLabel } from '../lib/format';
import type { ActionItem, ActionKind } from '../lib/types';

const KIND: Record<ActionKind, string> = { signoff: 'Sign-off', uat: 'UAT', credentials: 'Credentials', documents: 'Documents', other: 'Request' };

export function ActionCard({ action, busy, onAct }: { action: ActionItem; busy: boolean; onAct: (a: ActionItem) => void }) {
  const due = action.dueOn ? dueLabel(action.dueOn) : null;
  return (
    <article className="action-card" aria-label={`${KIND[action.kind]}: ${action.title}`}>
      <div className="meta">
        <span className="tag">{KIND[action.kind]}</span>
        {due && <span className={due.overdue ? 'overdue' : undefined}>{due.text}</span>}
      </div>
      <h3>{action.title}</h3>
      {action.detail && <p>{action.detail}</p>}
      <div className="foot">
        <span className="muted">{action.engagementName}</span>
        {action.canAct
          ? <button type="button" className="btn btn-primary" disabled={busy} onClick={() => onAct(action)}>{action.kind === 'signoff' ? 'Review and sign off' : 'Mark as done'}</button>
          : <span className="muted">{action.kind === 'signoff' ? 'An admin signs this off' : 'An admin or reviewer handles this'}</span>}
      </div>
    </article>
  );
}
