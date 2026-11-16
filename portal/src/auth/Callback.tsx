// /auth/callback — where the API sends the browser after an SSO round trip.
// The session cookie is already set; load it and go where the API said.
import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import type { NextStep, Session } from '../lib/types';
import { AuthFrame } from './AuthFrame';
import { destinationFor, leaveTo, useSession } from './session';

const STEPS: NextStep[] = ['dashboard', 'select-workspace', 'mfa-setup', 'admin'];

export function Callback() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { setSession } = useSession();

  useEffect(() => {
    let cancelled = false;
    api.get<{ session: Session }>('/auth/session', { quiet401: true })
      .then((r) => {
        if (cancelled) return;
        setSession(r.session);
        const to = STEPS.includes(params.get('to') as NextStep) ? (params.get('to') as NextStep) : 'dashboard';
        leaveTo(navigate, destinationFor(to, params.get('next')));
      })
      .catch(() => { if (!cancelled) navigate('/sign-in?error=sso_failed', { replace: true }); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <AuthFrame><h1>Signing you in…</h1><span className="skeleton" style={{ height: 42 }} /></AuthFrame>;
}
