// Session state for the whole app, plus the idle timer.
//
// The server owns the truth: an HttpOnly cookie and a row in `sessions`.
// This provider only mirrors it so screens can render, and enforces the
// workspace's idle limit on the client the same way the server does:
//   - activity (keys, pointer, scroll) refreshes the server's clock, at most
//     once a minute
//   - two minutes before the limit a dialog asks "Stay signed in?"
//   - at the limit the session is ended and the person is sent to sign in,
//     with the page they were on remembered in ?next=
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api, onSessionEnded } from '../lib/api';
import type { NextStep, Session } from '../lib/types';
import { IdleTimeoutDialog } from '../components/IdleTimeoutDialog';

const WARN_BEFORE_MS = 2 * 60 * 1000;
const TOUCH_EVERY_MS = 60 * 1000;

interface SessionContext {
  session: Session | null;
  /** 'loading' until the first check with the server has finished. */
  status: 'loading' | 'ready';
  /** True from the moment a session is ended here until the sign-in page takes over. */
  ending: boolean;
  setSession: (s: Session | null) => void;
  switchWorkspace: (orgId: string) => Promise<Session>;
  signOut: () => Promise<void>;
  can: (permission: string) => boolean;
}

const Ctx = createContext<SessionContext | null>(null);

export function useSession(): SessionContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
}

/** Only ever send people to a path on this site. */
export function safeNext(value: string | null | undefined): string {
  return value && /^\/(?!\/)[\w\-./?=&%]*$/.test(value) ? value : '';
}

/** Where to go after a successful sign-in step. */
export function destinationFor(next: NextStep, wanted?: string | null): string {
  const target = safeNext(wanted);
  const carry = target ? `?next=${encodeURIComponent(target)}` : '';
  if (next === 'mfa-setup') return `/auth/mfa-setup${carry}`;
  if (next === 'select-workspace') return `/select-workspace${carry}`;
  if (next === 'admin') return '/admin';
  return target || '/dashboard';
}

/** `/admin` is the legacy console, a separate page load outside this app. */
export function leaveTo(navigate: (to: string, opts?: { replace?: boolean }) => void, to: string) {
  if (to === '/admin' || to.startsWith('/admin/') || to === '/classic') window.location.assign(to);
  else navigate(to, { replace: true });
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<Session | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready'>('loading');
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const locationRef = useRef(location);
  locationRef.current = location;

  // Idle bookkeeping. `deadline` is when the server will consider us idle.
  const lastTouch = useRef(Date.now());
  const [deadline, setDeadline] = useState<number | null>(null);
  const [warning, setWarning] = useState(false);
  const [now, setNow] = useState(Date.now());

  const [ending, setEnding] = useState(false);

  const adopt = useCallback((s: Session | null) => {
    setSessionState(s);
    if (s) {
      setEnding(false);
      lastTouch.current = Date.now();
      setDeadline(Math.min(new Date(s.idleExpiresAt).getTime(), new Date(s.expiresAt).getTime()));
    } else {
      setDeadline(null);
      setWarning(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    api.get<{ session: Session }>('/auth/session', { quiet401: true })
      .then((r) => { if (!cancelled) adopt(r.session); })
      .catch(() => { if (!cancelled) adopt(null); })
      .finally(() => { if (!cancelled) setStatus('ready'); });
    return () => { cancelled = true; };
  }, [adopt]);

  const endLocally = useCallback((reason: 'timeout' | 'expired' | 'signed_out') => {
    // Tells the shell not to run its own "not signed in" redirect, which
    // would replace the reason (and the page to return to) set below.
    setEnding(true);
    adopt(null);
    queryClient.clear();
    const here = locationRef.current;
    const onAuthPage = /^\/(sign-in|invite|auth)\b/.test(here.pathname);
    const next = reason !== 'signed_out' && !onAuthPage ? `&next=${encodeURIComponent(here.pathname + here.search)}` : '';
    if (!onAuthPage || reason === 'signed_out') navigate(`/sign-in?reason=${reason}${next}`, { replace: true });
  }, [adopt, navigate, queryClient]);

  // Any API call that finds the session gone lands here.
  useEffect(() => onSessionEnded(() => endLocally('expired')), [endLocally]);

  const touch = useCallback(async () => {
    lastTouch.current = Date.now();
    try {
      const r = await api.post<{ idleExpiresAt: string; expiresAt: string }>('/auth/session/touch');
      setDeadline(Math.min(new Date(r.idleExpiresAt).getTime(), new Date(r.expiresAt).getTime()));
    } catch { /* a 401 is handled by onSessionEnded */ }
  }, []);

  // Activity keeps the session alive, except while the warning is showing:
  // then it takes a deliberate click on "Stay signed in".
  useEffect(() => {
    if (!session) return;
    const onActivity = () => {
      if (warning) return;
      if (Date.now() - lastTouch.current > TOUCH_EVERY_MS) void touch();
    };
    const events: (keyof WindowEventMap)[] = ['pointerdown', 'keydown', 'wheel', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    return () => events.forEach((e) => window.removeEventListener(e, onActivity));
  }, [session, warning, touch]);

  useEffect(() => {
    if (!session || deadline === null) return;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      if (t >= deadline) {
        void api.post('/auth/sign-out').catch(() => {});
        endLocally('timeout');
      } else {
        setWarning(deadline - t <= WARN_BEFORE_MS);
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [session, deadline, endLocally]);

  const switchWorkspace = useCallback(async (orgId: string) => {
    const r = await api.post<{ session: Session }>('/auth/session/workspace', { orgId });
    queryClient.clear(); // nothing cached from the previous workspace may be shown
    adopt(r.session);
    return r.session;
  }, [adopt, queryClient]);

  const signOut = useCallback(async () => {
    try { await api.post('/auth/sign-out'); } catch { /* ending locally regardless */ }
    endLocally('signed_out');
  }, [endLocally]);

  // Once the sign-in page is showing, the hand-over is complete.
  useEffect(() => { if (ending && location.pathname === '/sign-in') setEnding(false); }, [ending, location.pathname]);

  const value = useMemo<SessionContext>(() => ({
    session,
    status,
    ending,
    setSession: adopt,
    switchWorkspace,
    signOut,
    can: (permission: string) => !!session && session.permissions.includes(permission),
  }), [session, status, ending, adopt, switchWorkspace, signOut]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <IdleTimeoutDialog
        open={!!session && warning && deadline !== null}
        secondsLeft={deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : 0}
        onStay={() => { setWarning(false); void touch(); }}
        onSignOut={() => void signOut()}
      />
    </Ctx.Provider>
  );
}
