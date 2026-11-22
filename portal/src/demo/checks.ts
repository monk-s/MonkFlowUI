// Reconciliation checks for Demo Mode, which runs with no API.
//
// The evaluator is a copy of server/src/portal/review.js (the copy real
// workspaces use). Change both.
import type { ReviewCheck, ReviewField } from '../lib/types';
import templates from './templates.json';

type Rule = { id: string; label: string; blocking: boolean } & (
  | { kind: 'sum'; group: string; key: string; equals: string }
  | { kind: 'ratio'; top: string; bottom: string; equals: string }
  | { kind: 'diff'; a: string; b: string; equals: string }
  | { kind: 'rowsum'; group: string; keys: string[]; total: string }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | { kind: 'formula' | 'match' | 'compare' | 'flag'; [key: string]: any }
);
export interface Template { label: string; fieldApproval?: boolean; groups: { key: string; label: string; reference?: boolean; hidden?: boolean }[]; checks: Rule[] }

export const MONTHS = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'm10', 'm11', 'm12'];

// A copy of server/src/portal/templates.json (the two builds cannot read each
// other's folders). server/tests/review.test.js fails if they differ.
export const TEMPLATES = templates as Record<string, Template>;

/** "$1,450.00" -> 1450, "(250)" -> -250, "93.8%" -> 93.8, "1,5O0" -> NaN. */
export function num(value: string | null | undefined): number {
  const s = String(value ?? '').trim();
  if (!/^\(?-?\$?\d[\d,]*(\.\d+)?%?\)?$|^\(?-?\$?\.\d+%?\)?$/.test(s)) return NaN;
  const n = Number(s.replace(/[$,%()-]/g, ''));
  return /^\(|^-/.test(s) ? -n : n;
}

const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

// The check kinds a K-1 needs. Missing or empty figures count as zero, since
// most boxes on a K-1 are blank. This function is the same in
// server/src/portal/review.js and portal/src/demo/checks.ts: change both.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- kept identical to the server's plain JavaScript
function moreKinds(c: any, fields: any[], h: any): ReviewCheck | null {
  const { single, result, missing, compare } = h;
  const blank = (f: any) => !f || String(f.value == null ? '' : f.value).trim() === '';
  const val = (path: string) => {
    const [group, key] = path.split('.');
    if (key.endsWith('*')) return fields.filter((f: any) => f.group === group && f.row == null && f.key.startsWith(key.slice(0, -1))).reduce((n: number, f: any) => n + (blank(f) ? 0 : num(f.value)), 0);
    const f = single(path);
    return blank(f) ? 0 : num(f.value);
  };
  const norm = (v: unknown) => String(v == null ? '' : v).toLowerCase().replace(/[^a-z0-9.]/g, '');
  const yes = (f: any) => !!f && /^(yes|x|true|checked)$/i.test(String(f.value).trim());

  if (c.kind === 'formula') {
    const target = single(c.equals);
    if (blank(target) || (c.needs || []).some((p: string) => !single(p))) return missing(c, 'a figure it needs is not on this document or in the office records');
    if (c.whenPositive && !(val(c.whenPositive) > 0)) return missing(c, 'it only applies when the larger figure is a gain');
    const got = c.terms.reduce((n: number, t: string) => n + (t[0] === '-' ? -1 : 1) * val(t.slice(1)), 0);
    const want = num(target.value);
    if (Number.isNaN(got) || Number.isNaN(want)) return result(c, 'fail', 'A figure this check uses cannot be read as a number.');
    const tolerance = c.tolerance == null ? 0.01 : c.tolerance;
    if (c.op !== 'lte') return compare(c, got, want, tolerance, 'The calculation gives');
    return got <= want + tolerance
      ? result(c, 'pass', `${fmt(got)} is not more than ${fmt(want)}.`)
      : result(c, 'fail', `${fmt(got)} is more than "${target.label}" (${fmt(want)}).`);
  }
  if (c.kind === 'match') {
    const pairs = c.pairs.map(([a, b]: any[]) => [single(a), single(b)]);
    if (pairs.some(([a, b]: any[]) => !a || !b)) return missing(c, 'a value it compares is not on this document or in the office records');
    const off = pairs.filter(([a, b]: any[]) => norm(a.value) !== norm(b.value));
    return off.length
      ? result(c, 'fail', `Does not match the office records: ${off.map(([a]: any[]) => a.label).join('; ')}.`)
      : result(c, 'pass', 'Every value matches the office records.');
  }
  if (c.kind === 'compare') {
    const base = fields.filter((f: any) => f.group === c.against && f.row == null);
    const off: string[] = [];
    let compared = 0;
    for (const b of base) {
      const f = fields.find((x: any) => c.groups.includes(x.group) && x.row == null && x.key === b.key);
      if (!f) continue;
      compared++;
      const [now, then] = [blank(f) ? 0 : num(f.value), blank(b) ? 0 : num(b.value)];
      const d = Math.abs(now - then);
      if (d > c.abs && d > (Math.abs(then) * c.pct) / 100) off.push(`${f.label}: ${fmt(then)} then, ${fmt(now)} now`);
    }
    if (!compared) return missing(c, 'there is nothing on file to compare with');
    return off.length ? result(c, 'fail', `${off.join('; ')}.`) : result(c, 'pass', `${compared} figures compared.`);
  }
  if (c.kind === 'flag') {
    if (c.test === 'truthy') return yes(single(c.field)) ? result(c, 'fail', c.detail) : result(c, 'pass', 'Not marked on this document.');
    if (c.test === 'requires') return val(c.if) > 0 && !single(c.need) ? result(c, 'fail', c.detail) : result(c, 'pass', 'Nothing is missing.');
    if (c.test === 'codes') {
      const odd = fields.filter((f: any) => f.group === c.group && f.row == null && c.prefixes.some((p: string) => f.key.startsWith(p)) && !c.known.includes(f.key));
      return odd.length ? result(c, 'fail', `Not seen by the office before: ${odd.map((f: any) => f.label).join('; ')}.`) : result(c, 'pass', 'Every code has been seen before.');
    }
    if (c.test === 'changed') {
      const [a, b] = [single(c.field), single(c.against)];
      if (!a || !b) return missing(c, 'there is no figure from last year to compare with');
      return norm(a.value) !== norm(b.value) && !yes(single(c.unless))
        ? result(c, 'fail', `"${a.label}" was ${b.value} last year and is ${a.value} now, with no transfer on record.`)
        : result(c, 'pass', 'Unchanged, or a transfer is on record.');
    }
    const low = fields.filter((f: any) => typeof f.confidence === 'number' && f.confidence < c.below && !f.editedAt && !f.approvedAt);
    return low.length ? result(c, 'fail', `Read with low confidence and not yet confirmed: ${low.map((f: any) => f.label).join('; ')}.`) : result(c, 'pass', 'No low-confidence field is waiting.');
  }
  return null;
}

export function runChecks(templateKey: string, fields: ReviewField[]): ReviewCheck[] {
  const template = TEMPLATES[templateKey];
  if (!template) return [];
  const single = (path: string) => {
    const [group, key] = path.split('.');
    return fields.find((f) => f.group === group && f.key === key && f.row === null);
  };
  const result = (c: Rule, status: ReviewCheck['status'], detail: string): ReviewCheck => ({ id: c.id, label: c.label, blocking: c.blocking, status, detail });
  const missing = (c: Rule, what: string) => result(c, 'na', `Not checked: ${what}.`);
  const unreadable = (c: Rule, f: ReviewField) => result(c, 'fail', `"${f.label}"${f.row !== null ? ` in row ${f.row + 1}` : ''} cannot be read as a number.`);
  const compare = (c: Rule, got: number, want: number, tolerance: number, said: string) => (Math.abs(got - want) <= tolerance
    ? result(c, 'pass', `${said} ${fmt(got)}, as stated.`)
    : result(c, 'fail', `${said} ${fmt(got)}; the document states ${fmt(want)} (difference ${fmt(Math.abs(got - want))}).`));

  return template.checks.map((c) => {
    if (c.kind === 'sum') {
      const parts = fields.filter((f) => f.group === c.group && f.key === c.key && f.row !== null);
      const total = single(c.equals);
      if (!parts.length || !total) return missing(c, 'the document has no rows or no stated total');
      const bad = [...parts, total].find((f) => Number.isNaN(num(f.value)));
      if (bad) return unreadable(c, bad);
      return compare(c, parts.reduce((n, f) => n + num(f.value), 0), num(total.value), 0.01, 'The rows add up to');
    }
    if (c.kind === 'ratio' || c.kind === 'diff') {
      const [a, b, stated] = [single(c.kind === 'ratio' ? c.top : c.a), single(c.kind === 'ratio' ? c.bottom : c.b), single(c.equals)];
      if (!a || !b || !stated) return missing(c, 'one of the figures it compares was not extracted');
      const bad = [a, b, stated].find((f) => Number.isNaN(num(f.value)));
      if (bad) return unreadable(c, bad);
      if (c.kind === 'diff') return compare(c, num(a.value) - num(b.value), num(stated.value), 0.01, 'The difference is');
      if (num(b.value) === 0) return result(c, 'fail', `"${b.label}" is zero.`);
      return compare(c, (num(a.value) / num(b.value)) * 100, num(stated.value), 0.1, 'The calculated figure is');
    }
    const more = moreKinds(c, fields, { single, result, missing, compare });
    if (more) return more;
    const rows = [...new Set(fields.filter((f) => f.group === c.group && f.row !== null).map((f) => f.row as number))];
    if (!rows.length) return missing(c, 'the document has no rows in this section');
    const off: number[] = [];
    for (const row of rows) {
      const cell = (key: string) => fields.find((f) => f.group === c.group && f.row === row && f.key === key);
      const cells = [...c.keys.map(cell), cell(c.total)];
      if (cells.some((f) => !f)) return missing(c, `row ${row + 1} is missing a month or its annual figure`);
      const all = cells as ReviewField[];
      const bad = all.find((f) => Number.isNaN(num(f.value)));
      if (bad) return unreadable(c, bad);
      const sum = all.slice(0, -1).reduce((n, f) => n + num(f.value), 0);
      if (Math.abs(sum - num(all[all.length - 1].value)) > 0.01) off.push(row + 1);
    }
    return off.length
      ? result(c, 'fail', `${off.length} of ${rows.length} rows do not add up: row ${off.join(', ')}.`)
      : result(c, 'pass', `All ${rows.length} rows add up.`);
  });
}
