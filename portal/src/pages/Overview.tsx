// /dashboard — Overview.
//
//   1. Waiting on you     sign-offs and requests, soonest due first. Absent
//                         when there is nothing; never a "nothing to do" card.
//   2. Engagement         the four-stage tracker with milestones.
//   3. Telemetry          four tiles counted from this workspace's own runs.
//                         Before the first run the row says so instead.
//   4. Activity and workflow health.
//
// Each block loads and fails on its own, so one error leaves the rest usable.
// No sample figures: a number is measured from this workspace or not shown.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Dialog from '@radix-ui/react-dialog';
import { Check, ChevronRight } from 'lucide-react';
import { useSession } from '../auth/session';
import { ActionCard } from '../components/ActionCard';
import { EmptyState, LoadError, Page, TableSkeleton } from '../components/Page';
import { PeriodSwitch, RunTiles } from '../components/RunTiles';
import { StageTracker } from '../components/StageTracker';
import { useData } from '../data/PortalDataSource';
import { errorMessage } from '../lib/api';
import { percent, relativeTime } from '../lib/format';
import type { ActionItem, PeriodDays } from '../lib/types';
import { verticalPack } from '../verticals';
import { WorkflowStatusPill } from './workflows/status';
import '../styles/console.css';

type Confirm = { kind: 'signoff' | 'done'; id: string; title: string };

export function Overview() {
  const data = useData();
  const { session, can } = useSession();
  const queryClient = useQueryClient();
  const orgId = session?.org?.id;
  const [days, setDays] = useState<PeriodDays>(30);
  const [engagementId, setEngagementId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [flash, setFlash] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null);

  const actions = useQuery({ queryKey: ['actions', orgId], queryFn: () => data.getActions() });
  const engagements = useQuery({ queryKey: ['engagements', orgId], queryFn: () => data.getEngagements() });
  const telemetry = useQuery({ queryKey: ['telemetry', orgId, days], queryFn: () => data.getTelemetry(days), placeholderData: (prev) => prev });
  const activity = useQuery({ queryKey: ['activity', orgId], queryFn: () => data.getActivity() });
  const workflows = useQuery({ queryKey: ['workflows', orgId, 30], queryFn: () => data.getWorkflows(30) });

  const act = useMutation({
    mutationFn: (c: Confirm) => (c.kind === 'signoff' ? data.signOffMilestone(c.id) : data.completeAction(c.id)),
    onSuccess: (_r, c) => {
      setConfirm(null);
      setFlash({ kind: 'ok', text: c.kind === 'signoff' ? `Signed off: ${c.title}. It is recorded with your name and the time.` : `Marked as done: ${c.title}.` });
    },
    onError: (err) => { setConfirm(null); setFlash({ kind: 'bad', text: errorMessage(err) }); },
    onSettled: () => { for (const key of ['actions', 'engagements', 'activity']) void queryClient.invalidateQueries({ queryKey: [key, orgId] }); },
  });

  if (!session?.org) return null;
  const pack = verticalPack(session.org.vertical);
  const list = engagements.data ?? [];
  const engagement = list.find((e) => e.id === engagementId) ?? list[0];
  const onAct = (a: ActionItem) => setConfirm({ kind: a.kind === 'signoff' ? 'signoff' : 'done', id: a.id, title: a.title });

  return (
    <Page title={`Welcome, ${session.user.firstName || 'there'}`} description={`${session.org.name} · ${pack.label}`}>
      {flash && <div className={`notice notice-${flash.kind}`} role="status"><div style={{ flex: 1 }}>{flash.text}</div><button type="button" className="link-btn" onClick={() => setFlash(null)}>Dismiss</button></div>}

      {/* 1. Waiting on you */}
      {actions.isError && <LoadError message={`What is waiting on you could not be loaded. ${errorMessage(actions.error)}`} onRetry={() => void actions.refetch()} />}
      {actions.data && actions.data.length > 0 && (
        <section aria-labelledby="waiting" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s3)' }}>
          <div className="section-head"><h2 id="waiting">Waiting on you <span className="muted num" style={{ fontWeight: 500 }}>· {actions.data.length}</span></h2></div>
          <div className="actions">
            {actions.data.map((a) => <ActionCard key={`${a.kind}-${a.id}`} action={a} busy={act.isPending} onAct={onAct} />)}
          </div>
        </section>
      )}

      {/* 2. Engagement */}
      <section className="card" aria-labelledby="engagement">
        <div className="card-head">
          <h2 id="engagement">{engagement ? engagement.name : 'Engagement'}</h2>
          {list.length > 1 && (
            <div className="seg" role="group" aria-label="Engagement">
              {list.map((e) => <button key={e.id} type="button" aria-pressed={e.id === engagement?.id} onClick={() => setEngagementId(e.id)}>{e.name}</button>)}
            </div>
          )}
        </div>
        {engagements.isPending && <TableSkeleton rows={3} cols={4} />}
        {engagements.isError && <div className="card-body"><LoadError message={errorMessage(engagements.error)} onRetry={() => void engagements.refetch()} /></div>}
        {engagements.data && !engagement && (
          <EmptyState title="Your engagement tracker opens here">
            Once kickoff is scheduled, this shows the four stages of the build, the milestones in each, and anything that needs your sign-off.
          </EmptyState>
        )}
        {engagement && (
          <>
            {engagement.summary && <p className="card-body muted" style={{ paddingBottom: 0 }}>{engagement.summary}</p>}
            <StageTracker key={engagement.id} engagement={engagement} canSignOff={can('engagement.signoff')}
              onSignOff={(m) => setConfirm({ kind: 'signoff', id: m.id, title: m.title })} />
          </>
        )}
      </section>

      {engagements.data && !engagement && <GettingStarted base={data.base} orgName={session.org.name} manage={can('team.manage')} />}

      {/* 3. Telemetry */}
      <section aria-labelledby="telemetry" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s3)' }}>
        <div className="section-head">
          <h2 id="telemetry">Performance</h2>
          {telemetry.data?.started && <PeriodSwitch value={days} onChange={setDays} />}
        </div>
        {telemetry.isPending && <div className="tiles" aria-busy="true">{[0, 1, 2, 3].map((i) => <div key={i} className="tile"><span className="skeleton" style={{ height: 12, width: '50%' }} /><span className="skeleton" style={{ height: 30, width: '40%', marginTop: 8 }} /></div>)}</div>}
        {telemetry.isError && <LoadError message={errorMessage(telemetry.error)} onRetry={() => void telemetry.refetch()} />}
        {telemetry.data && !telemetry.data.started && (
          <div className="card">
            <EmptyState title="Telemetry starts when your first workflow is in production">
              Completed runs, success rate, run time and hours saved appear here, counted from your own runs. Nothing is shown until there is something to measure.
            </EmptyState>
          </div>
        )}
        {telemetry.data?.started && <RunTiles days={telemetry.data.days} totals={telemetry.data.totals} series={telemetry.data.series} saved={telemetry.data.saved} />}
      </section>

      {/* 4. Activity and workflow health */}
      <div className="grid-2">
        <section className="card" aria-labelledby="activity">
          <div className="card-head"><h2 id="activity">Recent activity</h2></div>
          {activity.isPending && <TableSkeleton rows={3} cols={2} />}
          {activity.isError && <div className="card-body"><LoadError message={errorMessage(activity.error)} onRetry={() => void activity.refetch()} /></div>}
          {activity.data && activity.data.length === 0 && <EmptyState title="Nothing yet">Milestones, sign-offs and requests on your engagement are listed here as they happen.</EmptyState>}
          {activity.data && activity.data.length > 0 && (
            <ul className="activity">
              {activity.data.map((a) => (
                <li key={a.id}>
                  <div className="what">{a.summary}<span>{a.actor}</span></div>
                  <time dateTime={a.at} title={new Date(a.at).toLocaleString()}>{relativeTime(a.at)}</time>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card" aria-labelledby="health">
          <div className="card-head">
            <h2 id="health">Workflow health</h2>
            {workflows.data && workflows.data.length > 0 && <Link to={`${data.base}/workflows`}>All workflows</Link>}
          </div>
          {workflows.isPending && <TableSkeleton rows={3} cols={4} />}
          {workflows.isError && <div className="card-body"><LoadError message={errorMessage(workflows.error)} onRetry={() => void workflows.refetch()} /></div>}
          {workflows.data && workflows.data.length === 0 && <EmptyState title="No workflows yet">The automations we run for {session.org.name} are listed here once they are built.</EmptyState>}
          {workflows.data && workflows.data.length > 0 && (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Workflow</th><th>Status</th><th>Last run</th><th className="r">Success, 30 days</th></tr></thead>
                <tbody>
                  {workflows.data.map((w) => (
                    <tr key={w.id}>
                      <td><Link className="row-link" to={`${data.base}/workflows/${w.id}`}>{w.name}</Link></td>
                      <td><WorkflowStatusPill status={w.status} /></td>
                      <td className="muted num">{w.lastRunAt ? relativeTime(w.lastRunAt) : 'No runs yet'}</td>
                      <td className="r num">{w.successRate === null ? <span className="muted">No finished runs</span> : percent(w.successRate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <Dialog.Root open={!!confirm} onOpenChange={(v) => { if (!v && !act.isPending) setConfirm(null); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog">
            <Dialog.Title>{confirm?.kind === 'signoff' ? 'Sign off this milestone?' : 'Mark this as done?'}</Dialog.Title>
            <Dialog.Description className="dialog-desc">
              <strong>{confirm?.title}</strong><br />
              {confirm?.kind === 'signoff'
                ? `Signing off tells MonkFlow that ${session.org.name} accepts this milestone as delivered. Your name and the time are recorded in the audit log, and it cannot be undone from here.`
                : 'This tells MonkFlow your side is finished. It is recorded with your name and the time.'}
            </Dialog.Description>
            <div className="dialog-actions">
              <Dialog.Close className="btn" disabled={act.isPending}>Cancel</Dialog.Close>
              <button type="button" className="btn btn-primary" disabled={act.isPending} onClick={() => confirm && act.mutate(confirm)}>
                {act.isPending ? 'Saving…' : confirm?.kind === 'signoff' ? 'Sign off' : 'Mark as done'}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </Page>
  );
}

// Shown until the workspace has an engagement: the only things a new
// workspace can usefully do.
function GettingStarted({ base, orgName, manage }: { base: string; orgName: string; manage: boolean }) {
  const steps = [
    { done: true, title: 'Your login is set up', body: `You are signed in to ${orgName}.`, to: null as string | null },
    manage
      ? { done: false, title: 'Invite the people who will work here', body: 'Reviewers approve extracted documents. Auditors can read everything and change nothing.', to: `${base}/settings/team` }
      : { done: false, title: 'See who has access', body: 'Everyone in this workspace and what they can do.', to: `${base}/settings/team` },
    { done: false, title: 'Check how sign-in is set up', body: 'Required sign-in method, allowed email domains and the idle timeout for this workspace.', to: `${base}/settings/security` },
  ];
  return (
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
  );
}
