// Settings > Security: how people sign in to this workspace. Read-only in
// this release; MonkFlow sets these with the firm's IT contact at kickoff.
import { useQuery } from '@tanstack/react-query';
import { useSession } from '../../auth/session';
import { LoadError } from '../../components/Page';
import { useData } from '../../data/PortalDataSource';
import { errorMessage } from '../../lib/api';
import { shortDate } from '../../lib/format';

const PROVIDER = { microsoft: 'Microsoft', google: 'Google' } as const;
const METHOD: Record<string, string> = { password: 'Password', email_code: 'Emailed code', 'sso:microsoft': 'Microsoft', 'sso:google': 'Google' };

export function Security() {
  const data = useData();
  const { session } = useSession();
  const ws = useQuery({ queryKey: ['workspace', session?.org?.id], queryFn: () => data.getWorkspace() });

  return (
    <>
      <section className="card" aria-labelledby="policy">
        <div className="card-head"><h2 id="policy">Sign-in policy</h2></div>
        {ws.isPending && <div className="card-body"><span className="skeleton" style={{ height: 120 }} /></div>}
        {ws.isError && <div className="card-body"><LoadError message={errorMessage(ws.error)} onRetry={() => void ws.refetch()} /></div>}
        {ws.data && (
          <dl className="dl">
            <div>
              <dt>Required sign-in</dt>
              <dd>{ws.data.ssoRequired && ws.data.ssoProvider
                ? `${PROVIDER[ws.data.ssoProvider]} single sign-on is required. Passwords are not accepted.`
                : 'Not restricted. People sign in with a password, or with single sign-on where it is enabled.'}</dd>
            </div>
            <div>
              <dt>Email domains</dt>
              <dd>{ws.data.allowedEmailDomains.length
                ? <>{ws.data.allowedEmailDomains.map((d) => <span key={d} className="tag mono" style={{ marginRight: 6, textTransform: 'none' }}>{d}</span>)}<div className="hint" style={{ marginTop: 4 }}>Only these addresses can be invited.</div></>
                : 'Any address can be invited.'}</dd>
            </div>
            <div>
              <dt>Idle timeout</dt>
              <dd><span className="num">{ws.data.sessionIdleMinutes}</span> minutes without activity, with a 2-minute warning.</dd>
            </div>
            <div>
              <dt>Maximum session length</dt>
              <dd>Everyone signs in again at least every 12 hours.</dd>
            </div>
          </dl>
        )}
        <div className="card-body" style={{ borderTop: '1px solid var(--border)' }}>
          <p className="muted">To change any of these, email <a href="mailto:nathan@monkflow.io">nathan@monkflow.io</a>. Changes are recorded in your audit log.</p>
        </div>
      </section>

      {session && (
        <section className="card" aria-labelledby="this-session">
          <div className="card-head"><h2 id="this-session">This session</h2></div>
          <dl className="dl">
            <div><dt>Signed in with</dt><dd>{METHOD[session.authMethod] ?? session.authMethod}{session.mfaVerified ? ' and a second step' : ''}</dd></div>
            <div><dt>Ends at the latest</dt><dd className="num">{shortDate(session.expiresAt)}, {new Date(session.expiresAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</dd></div>
          </dl>
        </section>
      )}
    </>
  );
}
