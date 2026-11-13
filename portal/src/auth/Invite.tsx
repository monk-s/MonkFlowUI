// /invite/:token — first-time activation.
//
// The link is the only way an account is created. The screen shows the firm,
// the role and who sent it (all read-only), then offers the sign-in methods
// that firm allows. Every state the link can be in has its own screen:
// valid, expired (with a way to ask for a new one), already used, not valid.
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, ApiError, errorMessage } from '../lib/api';
import type { Invitation, SignInResult } from '../lib/types';
import { verticalPack } from '../verticals';
import { AuthFrame } from './AuthFrame';
import { Notice, PasswordField, PROVIDER_NAME, SsoButton } from './fields';
import { destinationFor, leaveTo, useSession } from './session';

const day = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '');

export function Invite() {
  const { token = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { session, status, setSession, signOut } = useSession();

  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [loadError, setLoadError] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [renewalAsked, setRenewalAsked] = useState(false);

  useEffect(() => { document.title = 'Invitation | MonkFlow'; }, []);

  useEffect(() => {
    let cancelled = false;
    api.get<{ invitation: Invitation }>(`/auth/invitations/${encodeURIComponent(token)}`, { quiet401: true })
      .then((r) => { if (!cancelled) setInvitation(r.invitation); })
      .catch((err) => { if (!cancelled) setLoadError(errorMessage(err, 'We could not load this invitation. Please try the link again.')); });
    return () => { cancelled = true; };
  }, [token]);

  const done = (result: SignInResult) => {
    if (result.session) setSession(result.session);
    leaveTo(navigate, destinationFor(result.next, ''));
  };

  const acceptWithPassword = async (e: FormEvent) => {
    e.preventDefault();
    const min = invitation?.minPasswordLength ?? 12;
    if (!firstName.trim()) return setError('Enter your first name.');
    if (!lastName.trim()) return setError('Enter your last name.');
    if (password.length < min) return setError(`Choose a password of at least ${min} characters.`);
    setError(''); setBusy(true);
    try {
      done(await api.post<SignInResult>(`/auth/invitations/${token}/accept`, { firstName: firstName.trim(), lastName: lastName.trim(), password }));
    } catch (err) {
      if (err instanceof ApiError && /^invitation_/.test(err.code)) setInvitation({ state: err.code === 'invitation_expired' ? 'expired' : 'accepted' });
      else setError(errorMessage(err));
    } finally { setBusy(false); }
  };

  const acceptAsSignedIn = async () => {
    setError(''); setBusy(true);
    try { done(await api.post<SignInResult>(`/auth/invitations/${token}/accept`)); }
    catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  };

  const askForNew = async () => {
    setRenewalAsked(true);
    try { await api.post(`/auth/invitations/${token}/request-new`); } catch { /* same confirmation either way */ }
  };

  const ssoEnabled = (invitation?.methods?.sso.length ?? 0) > 0;
  const frame = (children: React.ReactNode) => <AuthFrame ssoEnabled={ssoEnabled}>{children}</AuthFrame>;

  if (loadError) return frame(<><h1>Invitation</h1><Notice kind="bad">{loadError}</Notice></>);

  if (!invitation || status === 'loading') {
    return frame(
      <>
        <span className="skeleton" style={{ height: 34, width: '70%' }} />
        <span className="skeleton" style={{ height: 132 }} />
        <span className="skeleton" style={{ height: 42 }} />
      </>,
    );
  }

  if (invitation.state === 'invalid') {
    return frame(
      <>
        <h1>This invitation is not valid</h1>
        <p className="auth-sub">The link may have been replaced by a newer invitation, or withdrawn. Ask the person who invited you to send a new one.</p>
        <Link className="btn btn-lg btn-block" to="/sign-in">Go to sign in</Link>
      </>,
    );
  }

  if (invitation.state === 'accepted') {
    return frame(
      <>
        <h1>This invitation has been used</h1>
        <p className="auth-sub">Your access to {invitation.org?.name ?? 'the workspace'} is already set up. Sign in to continue.</p>
        <Link className="btn btn-primary btn-lg btn-block" to={`/sign-in${invitation.email ? `?email=${encodeURIComponent(invitation.email)}` : ''}`}>Sign in</Link>
      </>,
    );
  }

  if (invitation.state === 'expired') {
    return frame(
      <>
        <h1>This invitation has expired</h1>
        <p className="auth-sub">
          Your invitation to {invitation.org?.name} expired on {day(invitation.expiresAt)}. Invitations last a limited time so an old email cannot be used to get in.
        </p>
        {renewalAsked
          ? <Notice kind="ok">We have let {invitation.inviterName} know. A new invitation will arrive at {invitation.email}.</Notice>
          : <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => void askForNew()}>Request a new invitation</button>}
      </>,
    );
  }

  // ── Valid ──
  const org = invitation.org!;
  const pack = verticalPack(org.vertical);
  const arrivalError = params.get('error');
  const summary = (
    <dl className="invite-facts">
      <div><dt>Workspace</dt><dd>{org.name} <span className="tag" style={{ marginLeft: 6 }}>{pack.tag}</span></dd></div>
      <div><dt>Your access</dt><dd>{invitation.roleLabel}</dd></div>
      <div><dt>Invited by</dt><dd>{invitation.inviterName}</dd></div>
      <div><dt>For</dt><dd>{invitation.email}</dd></div>
    </dl>
  );
  const mismatch = arrivalError === 'email_mismatch' && (
    <Notice kind="bad">This invitation was sent to {invitation.email}. Sign in with that address to accept it.</Notice>
  );
  const signedInAs = session?.user.email.toLowerCase();
  const isInvitee = signedInAs === invitation.email!.toLowerCase();
  const providers = (invitation.methods?.sso ?? []).filter((p) => !invitation.ssoRequired || p === invitation.ssoRequired);

  // Signed in as someone else.
  if (session && !isInvitee) {
    return frame(
      <>
        <h1>Join {org.name}</h1>
        {summary}
        <Notice kind="warn">You are signed in as {session.user.email}. This invitation is for {invitation.email}.</Notice>
        <button type="button" className="btn btn-lg btn-block" onClick={() => void signOut()}>Sign out to switch account</button>
      </>,
    );
  }

  // Signed in as the invited address: one click.
  if (session && isInvitee) {
    return frame(
      <>
        <h1>Join {org.name}</h1>
        {summary}
        {error && <Notice kind="bad">{error}</Notice>}
        <button type="button" className="btn btn-primary btn-lg btn-block" disabled={busy} onClick={() => void acceptAsSignedIn()}>
          {busy ? 'Joining…' : 'Accept and open workspace'}
        </button>
      </>,
    );
  }

  // Has a login already, not signed in.
  if (invitation.accountExists && !invitation.ssoRequired) {
    return frame(
      <>
        <h1>Join {org.name}</h1>
        {summary}
        {mismatch}
        <p className="auth-foot">You already have a MonkFlow login for {invitation.email}. Sign in to add this workspace to it.</p>
        <Link className="btn btn-primary btn-lg btn-block" to={`/sign-in?invite=${token}&email=${encodeURIComponent(invitation.email!)}`}>Sign in to accept</Link>
      </>,
    );
  }

  return frame(
    <>
      <h1>Join {org.name}</h1>
      <p className="auth-sub">Set up your access to the MonkFlow client portal.</p>
      {summary}
      {mismatch}
      {arrivalError && arrivalError !== 'email_mismatch' && <Notice kind="bad">Sign-in did not complete. Please try again.</Notice>}

      {invitation.ssoRequired && providers.length === 0 && (
        <Notice kind="bad">{org.name} requires {PROVIDER_NAME[invitation.ssoRequired]} sign-in, which is not available right now. Contact MonkFlow and we will sort it out.</Notice>
      )}
      {providers.length > 0 && (
        <div className="auth-sso">
          {providers.map((p) => <SsoButton key={p} provider={p} email={invitation.email} invite={token} verb="Accept" />)}
        </div>
      )}
      {invitation.ssoRequired && providers.length > 0 && (
        <p className="auth-foot">{org.name} requires its own {PROVIDER_NAME[invitation.ssoRequired]} sign-in, so there is no separate password to set.</p>
      )}

      {!invitation.ssoRequired && invitation.methods?.password && (
        <>
          {providers.length > 0 && <div className="auth-divider">or set a password</div>}
          <form className="auth-form" onSubmit={acceptWithPassword} noValidate>
            {error && <Notice kind="bad">{error}</Notice>}
            <input type="email" name="email" autoComplete="username" value={invitation.email} readOnly hidden />
            <div className="field-row">
              <div className="field">
                <label htmlFor="first-name">First name</label>
                <input id="first-name" name="given-name" className="input" autoComplete="given-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
              </div>
              <div className="field">
                <label htmlFor="last-name">Last name</label>
                <input id="last-name" name="family-name" className="input" autoComplete="family-name" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
              </div>
            </div>
            <PasswordField id="new-password" label="Password" value={password} onChange={setPassword} autoComplete="new-password"
              hint={`At least ${invitation.minPasswordLength ?? 12} characters. A few unrelated words works well.`} />
            <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy}>{busy ? 'Setting up…' : 'Accept invitation'}</button>
          </form>
        </>
      )}
      <p className="auth-foot">This invitation is for {invitation.email} only and expires on {day(invitation.expiresAt)}.</p>
    </>,
  );
}
