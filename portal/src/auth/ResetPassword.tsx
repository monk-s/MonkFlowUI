// /auth/reset?token=… — choose a new password from an emailed link.
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError, errorMessage, isOffline } from '../lib/api';
import { AuthFrame } from './AuthFrame';
import { Notice, PasswordField } from './fields';

const MIN = 12;

export function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [dead, setDead] = useState(!token);
  const [busy, setBusy] = useState(false);

  useEffect(() => { document.title = 'Choose a new password | MonkFlow'; }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < MIN) return setError(`Choose a password of at least ${MIN} characters.`);
    if (password !== confirm) return setError('The two passwords do not match.');
    setError(''); setBusy(true);
    try {
      await api.post('/auth/reset-password', { token, newPassword: password });
      // Drops the one-time token from the address bar and history.
      navigate('/sign-in?reason=password_reset', { replace: true });
    } catch (err) {
      if (isOffline(err)) setError(errorMessage(err));
      else if (err instanceof ApiError && err.status === 400 && /expired|invalid/i.test(err.message)) setDead(true);
      else setError(errorMessage(err));
    } finally { setBusy(false); }
  };

  if (dead) {
    return (
      <AuthFrame>
        <h1>This reset link no longer works</h1>
        <p className="auth-sub">Reset links work once and expire after an hour. Request a new one from the sign-in page.</p>
        <Link className="btn btn-primary btn-lg btn-block" to="/sign-in">Go to sign in</Link>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame>
      <h1>Choose a new password</h1>
      <p className="auth-sub">You will use it to sign in to your MonkFlow client portal. Other devices will be signed out.</p>
      <form className="auth-form" onSubmit={submit} noValidate>
        {error && <Notice kind="bad">{error}</Notice>}
        <PasswordField id="new-password" label="New password" value={password} onChange={setPassword} autoComplete="new-password" hint={`At least ${MIN} characters.`} autoFocus />
        <PasswordField id="confirm-password" label="Confirm new password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
        <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy}>{busy ? 'Saving…' : 'Save new password'}</button>
      </form>
      <p className="auth-foot"><Link to="/sign-in">&larr; Back to sign in</Link></p>
    </AuthFrame>
  );
}
