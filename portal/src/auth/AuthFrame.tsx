// The two-panel frame shared by sign-in, invitation, MFA and reset screens.
//
// RIGHT PANEL RULES. It states how a workspace is protected and whether the
// platform is up. Every line must be true today and checkable:
//   - encryption: same wording as the public /security page
//   - isolation: enforced by Postgres row-level security and covered by
//     server/tests/isolation.test.js. Remove the line if that suite is ever
//     removed or failing.
//   - "your firm's own sign-in": shown only when the API reports SSO enabled
//   - status: read live from /api/v1/health, never hard-coded
// Do NOT add certifications (SOC 2 and the like), "end-to-end encryption",
// insurance or a DPA. MonkFlow does not hold or offer those today.
import { useEffect, useState, type ReactNode } from 'react';
import { Building2, KeyRound, Lock, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api';
import type { AuthMethods } from '../lib/types';
import logoMark from '../assets/logo-mark.svg';
import '../styles/auth.css';

type Health = 'checking' | 'ok' | 'degraded' | 'down';

function useHealth(): Health {
  const [health, setHealth] = useState<Health>('checking');
  useEffect(() => {
    let cancelled = false;
    api.get<{ status: string }>('/health', { quiet401: true })
      .then((r) => { if (!cancelled) setHealth(r.status === 'ok' ? 'ok' : 'degraded'); })
      .catch(() => { if (!cancelled) setHealth('down'); });
    return () => { cancelled = true; };
  }, []);
  return health;
}

const HEALTH_TEXT: Record<Health, string> = {
  checking: 'Checking platform status',
  ok: 'All systems operational',
  degraded: 'Some services are degraded',
  down: 'Platform status is unavailable right now',
};

export function useAuthMethods(): AuthMethods | null {
  const [methods, setMethods] = useState<AuthMethods | null>(null);
  useEffect(() => {
    let cancelled = false;
    api.get<{ methods: AuthMethods }>('/auth/config', { quiet401: true })
      .then((r) => { if (!cancelled) setMethods(r.methods); })
      // If the API cannot be reached, offer the one method that always exists.
      .catch(() => { if (!cancelled) setMethods({ password: true, passwordReset: true, emailCode: false, sso: [], mfa: false, passkey: false }); });
    return () => { cancelled = true; };
  }, []);
  return methods;
}

export function AuthFrame({ children, ssoEnabled }: { children: ReactNode; ssoEnabled?: boolean }) {
  const health = useHealth();
  return (
    <div className="auth">
      <main className="auth-main">
        <div className="auth-top">
          <a href="/" className="auth-logo"><img src={logoMark} alt="" />MonkFlow</a>
          <a href="/" className="auth-back">&larr; monkflow.io</a>
        </div>
        <div className="auth-center">
          <div className="auth-card">{children}</div>
        </div>
        <div className="auth-top">
          <div className="auth-legal">
            <a href="/security">How we handle security</a>
          </div>
          <div className="auth-status-inline" role="status">
            <span className={`status-dot ${health}`} />{HEALTH_TEXT[health]}
          </div>
        </div>
      </main>

      <aside className="auth-side" aria-label="How your workspace is protected">
        <div>
          <div className="eyebrow">Client portal</div>
          <h2>How your workspace is protected</h2>
          <ul className="auth-facts">
            <li><Lock aria-hidden /><span><strong>Encrypted in transit and at rest</strong>TLS on every connection, AES-256 for stored data.</span></li>
            <li><Building2 aria-hidden /><span><strong>Isolated from every other client</strong>Your firm's records are separated in the database itself, not only in the application.</span></li>
            {ssoEnabled && (
              <li><KeyRound aria-hidden /><span><strong>Your firm's own sign-in</strong>Use your Microsoft or Google work account, under the rules your IT team already sets.</span></li>
            )}
            <li><ShieldCheck aria-hidden /><span><strong>Zero-retention AI processing available</strong>Model providers can be set up so they do not keep your documents.</span></li>
          </ul>
        </div>
        <div className="auth-status" role="status">
          <span className={`status-dot ${health}`} />{HEALTH_TEXT[health]}
        </div>
      </aside>
    </div>
  );
}
