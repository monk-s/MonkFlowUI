// /sign-in
//
// Email first. What comes next depends on the firm, not on the person, so
// the screen never reveals whether an account exists:
//   firm requires SSO      -> one button to its identity provider
//   otherwise              -> password, or an emailed code when enabled
//   second factor enrolled -> 6-digit code
// Buttons appear only for methods the API reports as enabled (/auth/config).
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError, errorMessage } from '../lib/api';
import type { SignInResult, SsoProvider } from '../lib/types';
import { AuthFrame, useAuthMethods } from './AuthFrame';
import { CodeField, Notice, PasswordField, PROVIDER_NAME, SsoButton } from './fields';
import { destinationFor, leaveTo, safeNext, useSession } from './session';

type Step = 'email' | 'password' | 'sso' | 'mfa' | 'code' | 'forgot' | 'forgot-sent';

const validEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

// Messages for arriving here from somewhere else: ?reason= (we sent them)
// and ?error= (the SSO round trip failed).
function arrivalNotice(params: URLSearchParams): { kind: 'info' | 'bad' | 'ok'; text: string } | null {
  const reason = params.get('reason');
  if (reason === 'timeout') return { kind: 'info', text: 'You were signed out after a period without activity. Sign in to pick up where you left off.' };
  if (reason === 'expired') return { kind: 'info', text: 'Your session has ended. Sign in again to continue.' };
  if (reason === 'signed_out') return { kind: 'ok', text: 'You have signed out.' };
  if (reason === 'password_reset') return { kind: 'ok', text: 'Your password has been updated. Sign in with the new one.' };
  const error = params.get('error');
  const provider = PROVIDER_NAME[(params.get('provider') || '') as SsoProvider];
  if (error === 'sso_required') return { kind: 'bad', text: `Your firm requires sign-in with ${provider || 'its identity provider'}. Use that button below.` };
  if (error === 'no_account') return { kind: 'bad', text: 'There is no MonkFlow login for that account. Access is by invitation: ask your firm\'s admin to invite you.' };
  if (error === 'no_workspace') return { kind: 'bad', text: 'Your login is not attached to a workspace. Ask the person who invited you, or contact MonkFlow.' };
  if (error === 'sso_failed') return { kind: 'bad', text: 'Sign-in with your identity provider did not complete. Please try again.' };
  if (error) return { kind: 'bad', text: 'Sign-in did not complete. Please try again.' };
  return null;
}

export function SignIn() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { session, status, setSession } = useSession();
  const methods = useAuthMethods();

  const next = safeNext(params.get('next'));
  const invite = params.get('invite') || '';

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState(params.get('email') || '');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [requiredProvider, setRequiredProvider] = useState<SsoProvider | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const notice = arrivalNotice(params);

  useEffect(() => { document.title = 'Sign in | MonkFlow'; }, []);

  // Already signed in: this page has nothing to offer.
  useEffect(() => {
    if (status !== 'ready' || !session || invite) return;
    const to = session.mfaSetupRequired ? 'mfa-setup' : session.org ? 'dashboard' : session.workspaces.length > 1 ? 'select-workspace' : 'admin';
    leaveTo(navigate, destinationFor(to, next));
  }, [status, session, invite, next, navigate]);

  const finish = async (result: SignInResult) => {
    if (result.next === 'mfa') { setCode(''); setStep('mfa'); return; }
    if (result.session) setSession(result.session);
    // Arrived from an invitation for an existing login: accept it now.
    if (invite && result.next !== 'mfa-setup') {
      try {
        const accepted = await api.post<SignInResult>(`/auth/invitations/${invite}/accept`);
        if (accepted.session) setSession(accepted.session);
        return leaveTo(navigate, destinationFor(accepted.next, ''));
      } catch (err) {
        return navigate(`/invite/${invite}?error=${err instanceof ApiError ? err.code : 'failed'}`, { replace: true });
      }
    }
    leaveTo(navigate, destinationFor(result.next, invite ? `/invite/${invite}` : next));
  };

  const run = async (fn: () => Promise<void>) => {
    setError('');
    setBusy(true);
    try { await fn(); } catch (err) {
      if (err instanceof ApiError && err.code === 'sso_required') {
        setRequiredProvider((err.details.provider as SsoProvider) || 'microsoft');
        setStep('sso');
      } else if (err instanceof ApiError && err.code === 'mfa_expired') {
        setStep('password'); setPassword(''); setError(err.message);
      } else {
        setError(errorMessage(err));
      }
    } finally { setBusy(false); }
  };

  const submitEmail = (e: FormEvent) => {
    e.preventDefault();
    if (!validEmail(email)) return setError('Enter the work email you sign in with.');
    void run(async () => {
      const r = await api.post<{ ssoRequired: SsoProvider | null }>('/auth/discover', { email: email.trim() });
      if (r.ssoRequired) { setRequiredProvider(r.ssoRequired); setStep('sso'); } else { setPassword(''); setStep('password'); }
    });
  };

  const submitPassword = (e: FormEvent) => {
    e.preventDefault();
    if (!password) return setError('Enter your password.');
    void run(async () => finish(await api.post<SignInResult>('/auth/sign-in', { email: email.trim(), password })));
  };

  const submitMfa = (e: FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) return setError('Enter the 6-digit code from your authenticator app.');
    void run(async () => finish(await api.post<SignInResult>('/auth/mfa/verify', { code })));
  };

  const sendCode = () => run(async () => {
    await api.post('/auth/email-code', { email: email.trim() });
    setCode(''); setStep('code');
  });

  const submitCode = (e: FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) return setError('Enter the 6-digit code from the email.');
    void run(async () => finish(await api.post<SignInResult>('/auth/email-code/verify', { email: email.trim(), code })));
  };

  const submitForgot = (e: FormEvent) => {
    e.preventDefault();
    if (!validEmail(email)) return setError('Enter the work email you sign in with.');
    void run(async () => {
      // Same confirmation whether or not the address has a login.
      try { await api.post('/auth/forgot-password', { email: email.trim() }); } catch (err) { if (!(err instanceof ApiError)) throw err; }
      setStep('forgot-sent');
    });
  };

  const back = (to: Step = 'email') => { setError(''); setStep(to); };
  const identity = (
    <div className="auth-identity">
      <span>{email.trim()}</span>
      <button type="button" className="link-btn" onClick={() => back('email')}>Change</button>
    </div>
  );
  const errorBox = error && <Notice kind="bad">{error}</Notice>;
  const ssoList = (methods?.sso ?? []).filter((p) => !requiredProvider || p === requiredProvider);

  let body;
  if (step === 'email') {
    body = (
      <>
        <h1>Sign in</h1>
        <p className="auth-sub">{invite ? 'Sign in to accept your invitation.' : 'Your MonkFlow client portal.'}</p>
        {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}
        <form className="auth-form" onSubmit={submitEmail} noValidate>
          {errorBox}
          <div className="field">
            <label htmlFor="email">Work email</label>
            <input id="email" name="email" type="email" className="input" autoComplete="username" inputMode="email"
              value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!error || undefined} autoFocus required />
          </div>
          <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy || !methods}>{busy ? 'Checking…' : 'Continue'}</button>
        </form>
        {ssoList.length > 0 && (
          <>
            <div className="auth-divider">or</div>
            <div className="auth-sso">
              {ssoList.map((p) => <SsoButton key={p} provider={p} next={next} invite={invite} />)}
            </div>
          </>
        )}
        <p className="auth-foot">
          Not a client yet? The portal is for firms we are already working with. <a href="/book">Book a working session</a>
        </p>
      </>
    );
  } else if (step === 'sso' && requiredProvider) {
    const available = methods?.sso.includes(requiredProvider);
    body = (
      <>
        <h1>Sign in with {PROVIDER_NAME[requiredProvider]}</h1>
        <p className="auth-sub">Your firm requires its own sign-in for MonkFlow.</p>
        {identity}
        {available
          ? <div className="auth-sso"><SsoButton provider={requiredProvider} email={email.trim()} next={next} invite={invite} /></div>
          : <Notice kind="bad">{PROVIDER_NAME[requiredProvider]} sign-in is not available right now. Contact MonkFlow and we will sort it out.</Notice>}
      </>
    );
  } else if (step === 'password') {
    body = (
      <>
        <h1>Enter your password</h1>
        {identity}
        <form className="auth-form" onSubmit={submitPassword} noValidate>
          {errorBox}
          {/* Lets password managers pair the saved login with this field. */}
          <input type="email" name="email" autoComplete="username" value={email.trim()} readOnly hidden />
          <PasswordField id="password" label="Password" value={password} onChange={setPassword} autoComplete="current-password" invalid={!!error} autoFocus
            aside={methods?.passwordReset ? <button type="button" className="link-btn" onClick={() => back('forgot')}>Forgot password?</button> : undefined} />
          <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>
        {methods?.emailCode && (
          <p className="auth-foot"><button type="button" className="link-btn" onClick={() => void sendCode()} disabled={busy}>Email me a sign-in code instead</button></p>
        )}
      </>
    );
  } else if (step === 'mfa') {
    body = (
      <>
        <h1>Two-step sign-in</h1>
        <p className="auth-sub">Enter the 6-digit code from your authenticator app.</p>
        <form className="auth-form" onSubmit={submitMfa} noValidate>
          {errorBox}
          <CodeField id="mfa-code" label="Authentication code" value={code} onChange={setCode} invalid={!!error} />
          <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy}>{busy ? 'Verifying…' : 'Verify'}</button>
        </form>
        <p className="auth-foot"><button type="button" className="link-btn" onClick={() => back('email')}>&larr; Start over</button></p>
      </>
    );
  } else if (step === 'code') {
    body = (
      <>
        <h1>Check your email</h1>
        <p className="auth-sub">If <strong>{email.trim()}</strong> has a MonkFlow login, a 6-digit sign-in code is on its way.</p>
        <form className="auth-form" onSubmit={submitCode} noValidate>
          {errorBox}
          <CodeField id="email-code" label="Sign-in code" value={code} onChange={setCode} invalid={!!error} />
          <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy}>{busy ? 'Verifying…' : 'Sign in'}</button>
        </form>
        <p className="auth-foot">
          <button type="button" className="link-btn" onClick={() => void sendCode()} disabled={busy}>Send a new code</button>
          {' · '}
          <button type="button" className="link-btn" onClick={() => back('password')}>Use my password</button>
        </p>
      </>
    );
  } else if (step === 'forgot') {
    body = (
      <>
        <h1>Reset your password</h1>
        <p className="auth-sub">We will email you a link to choose a new one.</p>
        <form className="auth-form" onSubmit={submitForgot} noValidate>
          {errorBox}
          <div className="field">
            <label htmlFor="email">Work email</label>
            <input id="email" name="email" type="email" className="input" autoComplete="username" inputMode="email"
              value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required />
          </div>
          <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button>
        </form>
        <p className="auth-foot"><button type="button" className="link-btn" onClick={() => back('password')}>&larr; Back to sign in</button></p>
      </>
    );
  } else {
    body = (
      <>
        <h1>Check your email</h1>
        <p className="auth-sub">If <strong>{email.trim()}</strong> has a MonkFlow login, a reset link is on its way. It works once, for one hour.</p>
        <p className="auth-foot">Nothing after a few minutes? Check spam, or try the address your invitation was sent to.</p>
        <button type="button" className="btn btn-lg btn-block" onClick={() => back('email')}>Back to sign in</button>
      </>
    );
  }

  return <AuthFrame ssoEnabled={(methods?.sso.length ?? 0) > 0}>{body}</AuthFrame>;
}
