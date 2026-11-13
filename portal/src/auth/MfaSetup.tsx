// /auth/mfa-setup — add an authenticator app to a password login.
// Only reachable when the identity provider supports a second factor; the
// API refuses workspace data to a password session until this is done.
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { api, errorMessage } from '../lib/api';
import type { SignInResult } from '../lib/types';
import { AuthFrame } from './AuthFrame';
import { CodeField, Notice } from './fields';
import { destinationFor, leaveTo, useSession } from './session';

interface Enrollment { factorId: string; secret: string; otpauthUrl: string }

export function MfaSetup() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { session, status, setSession, signOut } = useSession();
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [qr, setQr] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { document.title = 'Set up two-step sign-in | MonkFlow'; }, []);

  useEffect(() => {
    if (status !== 'ready') return;
    if (!session) { void navigate('/sign-in', { replace: true }); return; }
    if (!session.mfaSetupRequired) { leaveTo(navigate, destinationFor(session.org ? 'dashboard' : 'select-workspace', params.get('next'))); return; }
    let cancelled = false;
    api.post<Enrollment>('/auth/mfa/enroll')
      .then(async (e) => {
        if (cancelled) return;
        setEnrollment(e);
        setQr(await QRCode.toString(e.otpauthUrl, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }));
      })
      .catch((err) => { if (!cancelled) setError(errorMessage(err)); });
    return () => { cancelled = true; };
    // Enrol once per visit; `session` changing must not start a second enrolment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const confirm = async (e: FormEvent) => {
    e.preventDefault();
    if (code.length !== 6 || !enrollment) return setError('Enter the 6-digit code from your authenticator app.');
    setError(''); setBusy(true);
    try {
      const result = await api.post<SignInResult>('/auth/mfa/enroll/confirm', { factorId: enrollment.factorId, code });
      if (result.session) setSession(result.session);
      leaveTo(navigate, destinationFor(result.next, params.get('next')));
    } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  };

  return (
    <AuthFrame>
      <h1>Set up two-step sign-in</h1>
      <p className="auth-sub">Your workspace requires a second step when you sign in with a password. It takes a minute and you only do it once.</p>
      <form className="auth-form" onSubmit={confirm} noValidate>
        {error && <Notice kind="bad">{error}</Notice>}
        <div className="mfa-qr">
          {qr ? <div dangerouslySetInnerHTML={{ __html: qr }} aria-label="QR code for your authenticator app" role="img" /> : <span className="skeleton" style={{ width: 132, height: 132 }} />}
          <div>
            <p><strong>1.</strong> Scan this with an authenticator app (Microsoft Authenticator, Google Authenticator, 1Password and similar).</p>
            {enrollment && <p className="hint" style={{ marginTop: 8 }}>Cannot scan? Enter this key instead:<br /><span className="mfa-secret">{enrollment.secret}</span></p>}
          </div>
        </div>
        <CodeField id="mfa-setup-code" label="2. Enter the 6-digit code the app shows" value={code} onChange={setCode} invalid={!!error} />
        <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy || !enrollment}>{busy ? 'Verifying…' : 'Turn on two-step sign-in'}</button>
      </form>
      <p className="auth-foot"><button type="button" className="link-btn" onClick={() => void signOut()}>Sign out</button></p>
    </AuthFrame>
  );
}
