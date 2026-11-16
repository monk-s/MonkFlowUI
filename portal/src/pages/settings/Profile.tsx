import { useSession } from '../../auth/session';
import { ROLE_HELP, ROLE_LABEL } from '../../lib/roles';

export function Profile() {
  const { session } = useSession();
  if (!session) return null;
  const role = session.role;
  return (
    <section className="card" aria-labelledby="you">
      <div className="card-head"><h2 id="you">Your profile</h2></div>
      <dl className="dl">
        <div><dt>Name</dt><dd>{`${session.user.firstName} ${session.user.lastName}`.trim() || 'Not set'}</dd></div>
        <div><dt>Email</dt><dd>{session.user.email}</dd></div>
        <div><dt>Workspace</dt><dd>{session.org?.name}</dd></div>
        <div>
          <dt>Your access</dt>
          <dd>{role ? ROLE_LABEL[role] : ''}{role && role !== 'monkflow_staff' && <div className="hint">{ROLE_HELP[role]}</div>}</dd>
        </div>
      </dl>
    </section>
  );
}
