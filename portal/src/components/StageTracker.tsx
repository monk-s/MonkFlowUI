// The four-stage rail for one engagement, with the milestones of the stage
// in view underneath. Opens on the current stage; any stage can be looked at.
import { useState } from 'react';
import { Check } from 'lucide-react';
import { calendarDate, shortDate } from '../lib/format';
import type { Engagement, Milestone, MilestoneStatus, Stage } from '../lib/types';

export const STAGES: { key: Stage; label: string }[] = [
  { key: 'discovery', label: 'Discovery and audit' },
  { key: 'architecture', label: 'Architecture and sandbox' },
  { key: 'integration', label: 'Integration and QA' },
  { key: 'production', label: 'Production and scale' },
];

const STATUS: Record<MilestoneStatus, { label: string; pill: string }> = {
  planned: { label: 'Planned', pill: 'pill' },
  in_progress: { label: 'In progress', pill: 'pill pill-info' },
  awaiting_signoff: { label: 'Ready for sign-off', pill: 'pill pill-warn' },
  complete: { label: 'Complete', pill: 'pill pill-ok' },
};

export function StageTracker({ engagement, canSignOff, onSignOff }: { engagement: Engagement; canSignOff: boolean; onSignOff: (m: Milestone) => void }) {
  const currentIndex = STAGES.findIndex((s) => s.key === engagement.stage);
  const finished = engagement.status === 'complete';
  const [view, setView] = useState<Stage>(engagement.stage);
  const shown = engagement.milestones.filter((m) => m.stage === view);

  return (
    <>
      <ol className="stages">
        {STAGES.map((s, i) => {
          const state = finished || i < currentIndex ? 'done' : i === currentIndex ? 'current' : 'upcoming';
          const waiting = engagement.milestones.filter((m) => m.stage === s.key && m.status === 'awaiting_signoff').length;
          return (
            <li key={s.key} data-reached={i <= currentIndex}>
              <button type="button" className="stage" data-state={state} aria-pressed={view === s.key} onClick={() => setView(s.key)}>
                <span className="dot" aria-hidden>{state === 'done' ? <Check /> : i + 1}</span>
                <span className="label">{s.label}</span>
                <span className="state">
                  {state === 'done' ? 'Complete' : state === 'current' ? (engagement.status === 'on_hold' ? 'On hold' : 'In progress') : 'Upcoming'}
                  {waiting > 0 && ` · ${waiting} to sign off`}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      {shown.length === 0 ? (
        <div className="empty" style={{ padding: 'var(--s5) var(--s4)' }}>
          <p>No milestones are set for this stage yet. We add them as the stage is planned.</p>
        </div>
      ) : (
        <ul className="milestones" aria-label={`Milestones: ${STAGES.find((s) => s.key === view)?.label}`}>
          {shown.map((m) => (
            <li key={m.id} className="milestone" data-status={m.status}>
              <span className="mark" aria-hidden>{m.status === 'complete' && <Check />}</span>
              <div className="body">
                <strong>{m.title}</strong>
                {m.detail && <span>{m.detail}</span>}
                {m.signedOffAt
                  ? <span>Signed off by {m.signedOffByName} on {shortDate(m.signedOffAt)}</span>
                  : m.dueOn && m.status !== 'complete' && <span>Due {calendarDate(m.dueOn)}</span>}
              </div>
              <div className="side">
                <span className={STATUS[m.status].pill}>{STATUS[m.status].label}</span>
                {m.status === 'awaiting_signoff' && canSignOff && (
                  <button type="button" className="btn btn-primary" onClick={() => onSignOff(m)}>Sign off</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {engagement.nextDeliverable && (
        <div className="tracker-foot">
          <span><strong>Next deliverable:</strong> {engagement.nextDeliverable}{engagement.nextDeliverableDue ? `, due ${calendarDate(engagement.nextDeliverableDue)}` : ''}</span>
        </div>
      )}
    </>
  );
}
