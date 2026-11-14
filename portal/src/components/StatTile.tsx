// A headline number with, optionally, its daily series underneath and a
// plain-language note on how it is calculated.
//
// Rule for every tile: the number is measured from this workspace's own
// runs, or it is not shown. Pass `value={null}` and say why in `none`;
// never render a zero that stands in for "we do not know".
import { useId, useState, type ReactNode } from 'react';
import { Info } from 'lucide-react';
import { calendarDate } from '../lib/format';
import type { DayCount } from '../lib/types';

export function StatTile({ label, value, unit, sub, none, how, children }: {
  label: string;
  value: string | null;
  unit?: string;
  sub?: ReactNode;
  /** Shown in place of the number when there is nothing to measure. */
  none?: string;
  /** How the number is calculated. */
  how: ReactNode;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="tile">
      <div className="tile-label">
        <span>{label}</span>
        <button type="button" className="tile-info" aria-expanded={open} aria-controls={id} aria-label={`How ${label.toLowerCase()} is calculated`} onClick={() => setOpen((v) => !v)}>
          <Info aria-hidden />
        </button>
      </div>
      {value !== null
        ? <div className="tile-value">{value}{unit && <small>{unit}</small>}</div>
        : <div className="tile-value none">{none}</div>}
      {sub && <div className="tile-sub">{sub}</div>}
      {children}
      {open && <div className="tile-how" id={id}>{how}</div>}
    </div>
  );
}

/** Daily bars: completed runs, with failed runs stacked on top in the status red. */
export function DailyBars({ series, label }: { series: DayCount[]; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const H = 34;
  const max = Math.max(1, ...series.map((d) => d.completed + d.failed));
  const step = 100 / series.length;
  const gap = series.length > 45 ? 0.25 : 0.6;
  const total = series.reduce((n, d) => n + d.completed + d.failed, 0);
  const tip = hover === null ? null : series[hover];

  return (
    <div className="spark-wrap">
      {tip && (
        <div className="spark-tip" role="status" style={{ left: `${Math.min(88, Math.max(12, (hover! + 0.5) * step))}%` }}>
          {calendarDate(tip.day, { month: 'short', day: 'numeric' })}: {tip.completed} completed{tip.failed ? `, ${tip.failed} failed` : ''}
        </div>
      )}
      <svg className="spark" viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" role="img"
        aria-label={`${label}: ${total} finished runs over ${series.length} days, by day`} onMouseLeave={() => setHover(null)}>
        {series.map((d, i) => {
          const ok = (d.completed / max) * (H - 2);
          const bad = (d.failed / max) * (H - 2);
          const x = i * step + gap / 2;
          const w = step - gap;
          return (
            <g key={d.day} onMouseEnter={() => setHover(i)}>
              <rect className="hit" x={i * step} y={0} width={step} height={H} />
              {d.completed + d.failed === 0
                ? <rect className="zero" x={x} y={H - 1} width={w} height={1} />
                : (
                  <>
                    {d.completed > 0 && <rect className="bar" x={x} y={H - ok} width={w} height={ok} />}
                    {d.failed > 0 && <rect className="bar fail" x={x} y={H - ok - bad - (d.completed ? 0.6 : 0)} width={w} height={bad} />}
                  </>
                )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
