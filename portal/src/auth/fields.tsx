// Small form pieces shared by the auth screens.
import { useState, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';
import type { SsoProvider } from '../lib/types';

export function PasswordField(props: {
  id: string; label: string; value: string; onChange: (v: string) => void;
  autoComplete: 'current-password' | 'new-password'; hint?: string; aside?: ReactNode; invalid?: boolean; autoFocus?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="field">
      {/* The aside (e.g. "Forgot password?") sits beside the label, not inside it. */}
      <div className="field-label"><label htmlFor={props.id}>{props.label}</label>{props.aside}</div>
      <div className="pw-wrap">
        <input
          id={props.id} name={props.id} className="input" type={show ? 'text' : 'password'}
          value={props.value} onChange={(e) => props.onChange(e.target.value)}
          autoComplete={props.autoComplete} aria-invalid={props.invalid || undefined}
          aria-describedby={props.hint ? `${props.id}-hint` : undefined} autoFocus={props.autoFocus} required
        />
        <button type="button" className="pw-toggle" aria-pressed={show} aria-controls={props.id} onClick={() => setShow((v) => !v)}>
          {show ? 'Hide' : 'Show'}
        </button>
      </div>
      {props.hint && <div className="hint" id={`${props.id}-hint`}>{props.hint}</div>}
    </div>
  );
}

/** One input for a 6-digit code: paste-friendly and works with SMS/authenticator autofill. */
export function CodeField(props: { id: string; label: string; value: string; onChange: (v: string) => void; invalid?: boolean }) {
  return (
    <div className="field">
      <label htmlFor={props.id}>{props.label}</label>
      <input
        id={props.id} name={props.id} className="input code-input" inputMode="numeric" pattern="[0-9]*" maxLength={6}
        autoComplete="one-time-code" value={props.value} aria-invalid={props.invalid || undefined} autoFocus required
        onChange={(e) => props.onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
      />
    </div>
  );
}

export function Notice({ kind, children }: { kind: 'bad' | 'ok' | 'warn' | 'info'; children: ReactNode }) {
  const Icon = kind === 'ok' ? CheckCircle2 : kind === 'info' ? Info : AlertCircle;
  return (
    <div className={`notice notice-${kind}`} role={kind === 'bad' ? 'alert' : 'status'}>
      <Icon aria-hidden /><div>{children}</div>
    </div>
  );
}

export const PROVIDER_NAME: Record<SsoProvider, string> = { microsoft: 'Microsoft', google: 'Google' };

// Provider marks for the sign-in buttons, drawn as each provider's brand
// guidelines require. These fixed brand colours are the one place a hex
// value appears outside tokens.css.
function ProviderMark({ provider }: { provider: SsoProvider }) {
  if (provider === 'microsoft') {
    return (
      <svg className="mark" viewBox="0 0 21 21" aria-hidden>
        <rect x="1" y="1" width="9" height="9" fill="#f25022" /><rect x="11" y="1" width="9" height="9" fill="#7fba00" />
        <rect x="1" y="11" width="9" height="9" fill="#00a4ef" /><rect x="11" y="11" width="9" height="9" fill="#ffb900" />
      </svg>
    );
  }
  return (
    <svg className="mark" viewBox="0 0 48 48" aria-hidden>
      <path fill="#4285f4" d="M45.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.8-2.1 5.1-4.4 6.700v5.500h7.100c4.200-3.900 6.600-9.600 6.600-16.200z" />
      <path fill="#34a853" d="M24 46c5.900 0 10.900-2 14.500-5.300l-7.100-5.500c-2 1.300-4.500 2.100-7.400 2.100-5.700 0-10.500-3.800-12.200-9H4.500v5.700C8.100 41.100 15.500 46 24 46z" />
      <path fill="#fbbc05" d="M11.800 28.300c-.4-1.300-.7-2.800-.7-4.300s.3-2.900.7-4.300V14H4.500C3 17 2.200 20.400 2.200 24s.8 7 2.300 10z" />
      <path fill="#ea4335" d="M24 10.700c3.200 0 6.100 1.100 8.400 3.300l6.300-6.300C34.900 4.100 29.900 2 24 2 15.500 2 8.100 6.900 4.500 14l7.300 5.700c1.700-5.200 6.500-9 12.200-9z" />
    </svg>
  );
}

/** Starts the SSO round trip: a full-page navigation to the API, which redirects to the provider. */
export function SsoButton(props: { provider: SsoProvider; email?: string; next?: string; invite?: string; verb?: string }) {
  const q = new URLSearchParams();
  if (props.email) q.set('email', props.email);
  if (props.next) q.set('next', props.next);
  if (props.invite) q.set('invite', props.invite);
  const href = `/api/v1/auth/sso/${props.provider}/start${q.size ? `?${q}` : ''}`;
  return (
    <a className="btn btn-lg btn-block" href={href}>
      <ProviderMark provider={props.provider} />
      {props.verb || 'Continue'} with {PROVIDER_NAME[props.provider]}
    </a>
  );
}
