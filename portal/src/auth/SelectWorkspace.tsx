// /select-workspace — for people who belong to more than one workspace
// (several funds, entities or bank subsidiaries of one firm).
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { errorMessage } from '../lib/api';
import { verticalPack } from '../verticals';
import { ROLE_LABEL } from '../lib/roles';
import { AuthFrame } from './AuthFrame';
import { Notice } from './fields';
import { destinationFor, leaveTo, useSession } from './session';

export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');

export function SelectWorkspace() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { session, status, switchWorkspace, signOut } = useSession();
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');

  useEffect(() => { document.title = 'Choose a workspace | MonkFlow'; }, []);
  useEffect(() => {
    if (status === 'ready' && !session) navigate('/sign-in', { replace: true });
    if (status === 'ready' && session?.mfaSetupRequired) navigate('/auth/mfa-setup', { replace: true });
  }, [status, session, navigate]);

  if (!session) return <AuthFrame><span className="skeleton" style={{ height: 34, width: '60%' }} /><span className="skeleton" style={{ height: 160 }} /></AuthFrame>;

  const choose = async (orgId: string) => {
    setError(''); setBusyId(orgId);
    try {
      await switchWorkspace(orgId);
      leaveTo(navigate, destinationFor('dashboard', params.get('next')));
    } catch (err) { setError(errorMessage(err)); setBusyId(''); }
  };

  // Last used first, then by name.
  const last = session.lastOrgId ?? session.org?.id;
  const list = [...session.workspaces].sort((a, b) => Number(b.id === last) - Number(a.id === last) || a.name.localeCompare(b.name));

  return (
    <AuthFrame>
      <h1>Choose a workspace</h1>
      <p className="auth-sub">Signed in as {session.user.email}.</p>
      {error && <Notice kind="bad">{error}</Notice>}
      {list.length === 0 && (
        <Notice kind="warn">Your login is not attached to a workspace. Ask the person who invited you, or contact MonkFlow.</Notice>
      )}
      <div className="ws-list">
        {list.map((w) => (
          <button key={w.id} type="button" className="ws-option" disabled={!!busyId} onClick={() => void choose(w.id)}>
            <span className="ws-avatar" aria-hidden>{initials(w.name)}</span>
            <span className="grow">
              <span className="ws-name">{w.name}</span>
              <br />
              <span className="ws-meta">{verticalPack(w.vertical).label} · {w.role ? ROLE_LABEL[w.role] : ''}{w.id === last ? ' · Last used' : ''}</span>
            </span>
            <ChevronRight aria-hidden />
          </button>
        ))}
      </div>
      {session.user.isPlatformAdmin && <a className="btn btn-lg btn-block" href="/admin">Open the MonkFlow admin console</a>}
      <p className="auth-foot"><button type="button" className="link-btn" onClick={() => void signOut()}>Sign out</button></p>
    </AuthFrame>
  );
}
