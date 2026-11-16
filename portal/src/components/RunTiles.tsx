// The four numbers shown for a workspace (Overview) or one workflow.
// See StatTile for the rule: measured, or not shown.
import { count, calendarDate, duration, hours, percent } from '../lib/format';
import type { DayCount, HoursSaved, RunTotals } from '../lib/types';
import { DailyBars, StatTile } from './StatTile';

export function RunTiles({ days, totals, series, saved }: { days: number; totals: RunTotals; series: DayCount[]; saved: HoursSaved }) {
  const finished = totals.completed + totals.failed;
  const window = `the last ${days} days`;
  return (
    <div className="tiles">
      <StatTile label="Completed runs" value={count(totals.completed)}
        sub={totals.runs > finished ? `${count(totals.runs - finished)} still running` : `in ${window}`}
        how={<>Every workflow run that finished successfully in {window}, counted from the run history. Days are UTC calendar days.</>}>
        <DailyBars series={series} label="Runs per day" />
      </StatTile>

      <StatTile label="Success rate" value={totals.successRate === null ? null : percent(totals.successRate)} none="No finished runs in this period"
        sub={finished > 0 ? (totals.failed ? `${count(totals.failed)} of ${count(finished)} runs failed` : `All ${count(finished)} runs succeeded`) : undefined}
        how={<>Completed runs divided by all runs that finished (completed plus failed) in {window}. Runs still in progress are left out.</>} />

      <StatTile label="Median run time" value={totals.medianMs === null ? null : duration(totals.medianMs)} none="No completed runs in this period"
        sub={totals.medianMs === null ? undefined : 'start to finish, per run'}
        how={<>The middle value of how long each completed run took, start to finish, in {window}. Half of the runs were faster than this.</>} />

      <StatTile label="Hours saved" value={saved ? hours(saved.hours) : null} unit={saved ? 'hours' : undefined} none="No baseline agreed yet"
        sub={saved ? `against the agreed manual time, in ${window}` : 'Shown once we agree how long this work took by hand.'}
        how={saved ? (
          <>
            Completed runs multiplied by the time one run used to take a person, as agreed with your team.
            <ul>
              {saved.basis.map((b) => (
                <li key={b.workflowId}>
                  <strong>{b.workflow}:</strong> {count(b.runs)} runs × {b.minutesPerRun} minutes = {hours(b.hours)} hours
                  {b.from ? `, counted from ${calendarDate(b.from)}` : ''}.{b.basis ? ` Basis: ${b.basis}` : ''}
                </li>
              ))}
            </ul>
          </>
        ) : <>This figure needs a baseline: how many minutes one run of a workflow used to take a person. We agree that number with you and record where it came from. Until then no estimate is shown.</>} />
    </div>
  );
}

export function PeriodSwitch({ value, onChange }: { value: number; onChange: (d: 7 | 30 | 90) => void }) {
  return (
    <div className="seg" role="group" aria-label="Period">
      {([7, 30, 90] as const).map((d) => (
        <button key={d} type="button" aria-pressed={value === d} onClick={() => onChange(d)}>{d} days</button>
      ))}
    </div>
  );
}
