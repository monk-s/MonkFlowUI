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
