// Reconciliation checks for Demo Mode, which runs with no API.
//
// The evaluator is a copy of server/src/portal/review.js (the copy real
// workspaces use). Change both. The bank and investment templates exist only
// here: on the server only the CRE templates are built.
import type { ReviewCheck, ReviewField } from '../lib/types';

type Rule = { id: string; label: string; blocking: boolean } & (
  | { kind: 'sum'; group: string; key: string; equals: string }
  | { kind: 'ratio'; top: string; bottom: string; equals: string }
  | { kind: 'diff'; a: string; b: string; equals: string }
  | { kind: 'rowsum'; group: string; keys: string[]; total: string }
);
export interface Template { label: string; groups: { key: string; label: string }[]; checks: Rule[] }

export const MONTHS = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'm10', 'm11', 'm12'];

export const TEMPLATES: Record<string, Template> = {
  rent_roll: {
    label: 'Rent roll',
    groups: [{ key: 'property', label: 'Property' }, { key: 'units', label: 'Units' }, { key: 'totals', label: 'Totals' }],
    checks: [
      { id: 'rent_sum', kind: 'sum', label: 'Unit rents add up to the stated monthly total', group: 'units', key: 'rent', equals: 'totals.monthly_rent', blocking: true },
      { id: 'occupancy', kind: 'ratio', label: 'Occupancy equals occupied units over total units', top: 'property.occupied_units', bottom: 'property.total_units', equals: 'property.occupancy', blocking: false },
    ],
  },
  t12: {
    label: 'T-12 statement',
    groups: [{ key: 'income', label: 'Income' }, { key: 'expenses', label: 'Expenses' }, { key: 'totals', label: 'Totals' }],
    checks: [
      { id: 'income_months', kind: 'rowsum', label: 'Each income line: twelve months add up to its annual figure', group: 'income', keys: MONTHS, total: 'annual', blocking: true },
      { id: 'expense_months', kind: 'rowsum', label: 'Each expense line: twelve months add up to its annual figure', group: 'expenses', keys: MONTHS, total: 'annual', blocking: true },
      { id: 'income_total', kind: 'sum', label: 'Income lines add up to total income', group: 'income', key: 'annual', equals: 'totals.total_income', blocking: true },
      { id: 'expense_total', kind: 'sum', label: 'Expense lines add up to total expenses', group: 'expenses', key: 'annual', equals: 'totals.total_expenses', blocking: true },
      { id: 'noi', kind: 'diff', label: 'NOI equals total income minus total expenses', a: 'totals.total_income', b: 'totals.total_expenses', equals: 'totals.noi', blocking: true },
    ],
  },
  financial_statement: {
    label: 'Personal financial statement',
    groups: [{ key: 'borrower', label: 'Borrower' }, { key: 'assets', label: 'Assets' }, { key: 'liabilities', label: 'Liabilities' }, { key: 'totals', label: 'Totals' }],
    checks: [
      { id: 'assets', kind: 'sum', label: 'Asset lines add up to total assets', group: 'assets', key: 'amount', equals: 'totals.total_assets', blocking: true },
      { id: 'liabilities', kind: 'sum', label: 'Liability lines add up to total liabilities', group: 'liabilities', key: 'amount', equals: 'totals.total_liabilities', blocking: true },
      { id: 'net_worth', kind: 'diff', label: 'Net worth equals total assets minus total liabilities', a: 'totals.total_assets', b: 'totals.total_liabilities', equals: 'totals.net_worth', blocking: true },
    ],
  },
  subscription: {
    label: 'Subscription agreement',
    groups: [{ key: 'investor', label: 'Investor' }, { key: 'commitments', label: 'Commitments' }, { key: 'totals', label: 'Totals' }],
    checks: [
      { id: 'commitment', kind: 'sum', label: 'Commitments by class add up to the total commitment', group: 'commitments', key: 'amount', equals: 'totals.total_commitment', blocking: true },
    ],
  },
};

/** "$1,450.00" -> 1450, "(250)" -> -250, "93.8%" -> 93.8, "1,5O0" -> NaN. */
export function num(value: string | null | undefined): number {
  const s = String(value ?? '').trim();
  if (!/^\(?-?\$?\d[\d,]*(\.\d+)?%?\)?$|^\(?-?\$?\.\d+%?\)?$/.test(s)) return NaN;
  const n = Number(s.replace(/[$,%()-]/g, ''));
  return /^\(|^-/.test(s) ? -n : n;
}

const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

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
