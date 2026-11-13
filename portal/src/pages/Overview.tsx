// /dashboard — Overview.
//
// This release ships the frame, sign-in and team management. The engagement
// tracker, action queue and telemetry arrive next and replace the "opening
// soon" card. Until a number is measured from this workspace's own runs it
// is not shown at all: no sample figures on a client's home page.
import { Link } from 'react-router-dom';
import { Check, ChevronRight } from 'lucide-react';
import { useSession } from '../auth/session';
import { Page } from '../components/Page';
import { verticalPack } from '../verticals';

export function Overview() {
  const { session, can } = useSession();
  if (!session?.org) return null;
  const pack = verticalPack(session.org.vertical);

  const steps = [
    { done: true, title: 'Your login is set up', body: `You are signed in to ${session.org.name}.`, to: null as string | null },
    can('team.manage')
      ? { done: false, title: 'Invite the people who will work here', body: 'Reviewers approve extracted documents. Auditors can read everything and change nothing.', to: '/dashboard/settings/team' }
      : { done: false, title: 'See who has access', body: 'Everyone in this workspace and what they can do.', to: '/dashboard/settings/team' },
    { done: false, title: 'Check how sign-in is set up', body: 'Required sign-in method, allowed email domains and the idle timeout for this workspace.', to: '/dashboard/settings/security' },
  ];

  return (
    <Page title={`Welcome, ${session.user.firstName || 'there'}`} description={`${session.org.name} · ${pack.label}`}>
      <section className="card" aria-labelledby="start">
        <div className="card-head"><h2 id="start">Getting started</h2></div>
        <div>
          {steps.map((s) => {
            const row = (
              <>
                <span className="avatar" aria-hidden style={s.done ? undefined : { background: 'var(--surface-3)', color: 'var(--ink-3)' }}>{s.done ? <Check size={14} /> : ''}</span>
                <span className="who" style={{ flex: 1 }}><strong>{s.title}</strong><span>{s.body}</span></span>
                {s.to && <ChevronRight size={16} className="muted" aria-hidden />}
              </>
            );
            const style = { padding: '12px 16px', borderBottom: '1px solid var(--border)', color: 'inherit' } as const;
            return s.to
              ? <Link key={s.title} to={s.to} className="person" style={style}>{row}</Link>
              : <div key={s.title} className="person" style={style}>{row}</div>;
          })}
        </div>
      </section>

      <section className="card">
        <div className="empty">
          <h3>Engagement status and live numbers open here next</h3>
          <p>
            This page will show where your build stands, what is waiting on you, and how your workflows are performing
            ({pack.documentsPhrase} processed, review turnaround, field accuracy), measured from your own runs.
          </p>
        </div>
      </section>
    </Page>
  );
}
