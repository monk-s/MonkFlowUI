const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/** "3 hours ago", "yesterday", "in 5 days". */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return 'Never';
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return 'Just now';
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day');
  return shortDate(iso);
}

export const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/** A calendar date sent as YYYY-MM-DD, shown without shifting it across time zones. */
export const calendarDate = (ymd: string, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }) =>
  new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' });

/** "Due in 3 days", "Due today", "5 days overdue". */
export function dueLabel(ymd: string): { text: string; overdue: boolean } {
  const today = new Date();
  const start = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.round((new Date(`${ymd}T00:00:00Z`).getTime() - start) / 864e5);
  if (days < 0) return { text: `${-days} day${days === -1 ? '' : 's'} overdue`, overdue: true };
  if (days === 0) return { text: 'Due today', overdue: false };
  if (days === 1) return { text: 'Due tomorrow', overdue: false };
  return { text: days <= 14 ? `Due in ${days} days` : `Due ${calendarDate(ymd, { month: 'short', day: 'numeric' })}`, overdue: false };
}

export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export const count = (n: number) => n.toLocaleString('en-US');

/** 0.8333 -> "83%". One decimal only where it says something (99.5%). */
export function percent(ratio: number): string {
  const p = ratio * 100;
  return `${p >= 99 && p < 100 ? p.toFixed(1) : Math.round(p)}%`;
}

/** 420 -> "0.4 s", 72000 -> "1 min 12 s", 3900000 -> "1 h 5 min". */
export function duration(ms: number): string {
  if (ms < 1000) return `${(ms / 1000).toFixed(1)} s`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  if (s < 3600) return s % 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s / 60} min`;
  const m = Math.round(s / 60);
  return m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`;
}

/** Hours with one decimal under 100, whole hours above. */
export const hours = (h: number) => (h < 100 ? h.toFixed(1).replace(/\.0$/, '') : count(Math.round(h)));
