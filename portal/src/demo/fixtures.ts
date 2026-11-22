// EXAMPLE_DATA for Demo Mode. Every firm, person, property and figure in
// this file is invented. None of it is a client or a result, and it is only
// ever shown under the "Demo workspace · synthetic data" banner.
import type { ActionItem, Engagement, ReviewField, SyntheticPage, Vertical } from '../lib/types';
import { MONTHS, TEMPLATES } from './checks';
import { K1, k1Documents } from './k1';

/** Small seeded generator so a demo looks the same on every visit. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type Truth = Pick<ReviewField, 'group' | 'row' | 'key' | 'label' | 'value' | 'page'>;
/** What the extraction got wrong or was unsure of: "group.row.key" -> misread value and confidence. */
type Misreads = Record<string, { value?: string; confidence: number }>;

export interface ExampleDocument {
  template: string; title: string; subject: string; period: string; hoursAgo: number;
  fields: ReviewField[]; pages: SyntheticPage[];
  /** K-1s: page images of the sample PDF, shown instead of `pages`, and the tracker row it belongs to. */
  images?: { pdfUrl: string; pages: { page: number; src: string }[] }; slug?: string;
  decided?: { status: 'approved'; by: string };
}

function build(seed: number, head: Omit<ExampleDocument, 'fields' | 'pages'>, truth: Truth[], misreads: Misreads = {}): ExampleDocument {
  const rand = rng(seed);
  const fields = truth.map((t, i) => {
    const wrong = misreads[`${t.group}.${t.row ?? ''}.${t.key}`];
    return { ...t, id: `f${i}`, original: null, value: wrong?.value ?? t.value, confidence: wrong?.confidence ?? Math.round((0.96 + rand() * 0.039) * 1000) / 1000 };
  });
  // The "source document" is drawn from the true values, so a misread shows
  // as a real difference between the page and the extracted field.
  const pages: SyntheticPage[] = [];
  for (const page of [...new Set(truth.map((t) => t.page ?? 1))].sort((a, b) => a - b)) {
    const rows: SyntheticPage['rows'] = [];
    for (const g of TEMPLATES[head.template].groups) {
      const mine = truth.map((t, i) => ({ t, id: `f${i}` })).filter((x) => x.t.group === g.key && (x.t.page ?? 1) === page);
      if (!mine.length) continue;
      rows.push([{ text: g.label.toUpperCase() }]);
      for (const x of mine.filter((m) => m.t.row === null)) rows.push([{ text: x.t.label }, { text: x.t.value, fieldId: x.id }]);
      const tableRows = [...new Set(mine.filter((m) => m.t.row !== null).map((m) => m.t.row as number))];
      if (tableRows.length) rows.push(mine.filter((m) => m.t.row === tableRows[0]).map((m) => ({ text: m.t.label })));
      for (const r of tableRows) rows.push(mine.filter((m) => m.t.row === r).map((m) => ({ text: m.t.value, fieldId: m.id })));
    }
    pages.push({ page, heading: page === 1 ? `${head.subject}: ${TEMPLATES[head.template].label}, ${head.period}` : `${head.subject} (continued)`, rows });
  }
  return { ...head, fields, pages };
}

const one = (group: string, key: string, label: string, value: string, page = 1): Truth => ({ group, row: null, key, label, value, page });

const TENANTS = ['J. Alvarez', 'P. Banerjee', 'L. Chen', 'M. Dvorak', 'S. Eze', 'R. Fontaine', 'A. Greco', 'T. Haddad', 'K. Ito', 'D. Jansen', 'N. Kowalski', 'O. Lindqvist', 'C. Mbeki', 'E. Novak'];

function rentRoll(seed: number, subject: string, period: string, hoursAgo: number, units: number, misread: boolean): ExampleDocument {
  const rand = rng(seed);
  const truth: Truth[] = [];
  let total = 0;
  let occupied = 0;
  const rows: Truth[] = [];
  for (let r = 0; r < units; r++) {
    const vacant = rand() < 0.12;
    const rent = vacant ? 0 : 1250 + Math.round(rand() * 14) * 50;
    total += rent;
    if (!vacant) occupied++;
    rows.push(
      { group: 'units', row: r, key: 'unit', label: 'Unit', value: String(101 + r + Math.floor(r / 8) * 92), page: 2 },
      { group: 'units', row: r, key: 'tenant', label: 'Tenant', value: vacant ? 'Vacant' : TENANTS[Math.floor(rand() * TENANTS.length)], page: 2 },
      { group: 'units', row: r, key: 'lease_end', label: 'Lease ends', value: vacant ? '' : `${String(1 + Math.floor(rand() * 12)).padStart(2, '0')}/2027`, page: 2 },
      { group: 'units', row: r, key: 'rent', label: 'Rent', value: money(rent), page: 2 },
    );
  }
  truth.push(
    one('property', 'name', 'Property', subject), one('property', 'total_units', 'Units', String(units)),
    one('property', 'occupied_units', 'Occupied units', String(occupied)), one('property', 'occupancy', 'Occupancy', `${((occupied / units) * 100).toFixed(1)}%`),
    ...rows, one('totals', 'monthly_rent', 'Monthly rent', money(total), 2),
  );
  // The classic misread: a letter O where the scan shows a zero.
  const target = rows.find((t) => t.key === 'rent' && /^\$1,[2-9]00\.00$/.test(t.value) && (t.row as number) > 1);
  const misreads: Misreads = misread && target
    ? { [`units.${target.row}.rent`]: { value: target.value.replace('00.00', 'O0.00'), confidence: 0.61 }, [`units.${(target.row as number) + 1}.lease_end`]: { confidence: 0.86 } }
    : {};
  return build(seed, { template: 'rent_roll', title: `Rent roll, ${subject}, ${period}`, subject, period, hoursAgo }, truth, misreads);
}

function t12(seed: number, subject: string, period: string, hoursAgo: number): ExampleDocument {
  const rand = rng(seed);
  const truth: Truth[] = [];
  const sums: Record<string, number> = { income: 0, expenses: 0 };
  const lines: [string, string, number][] = [
    ['income', 'Rental income', 61000], ['income', 'Other income', 2400],
    ['expenses', 'Payroll', 7800], ['expenses', 'Repairs and maintenance', 4100], ['expenses', 'Utilities', 3600], ['expenses', 'Property taxes', 6900], ['expenses', 'Insurance', 2100],
  ];
  const rowOf: Record<string, number> = { income: 0, expenses: 0 };
  for (const [group, name, base] of lines) {
    const row = rowOf[group]++;
    let annual = 0;
    truth.push({ group, row, key: 'line', label: 'Line', value: name, page: group === 'income' ? 1 : 2 });
    MONTHS.forEach((m, i) => {
      const v = Math.round(base * (0.94 + rand() * 0.12));
      annual += v;
      truth.push({ group, row, key: m, label: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][i], value: v.toLocaleString('en-US'), page: group === 'income' ? 1 : 2 });
    });
    truth.push({ group, row, key: 'annual', label: 'Annual', value: annual.toLocaleString('en-US'), page: group === 'income' ? 1 : 2 });
    sums[group] += annual;
  }
  truth.push(
    one('totals', 'total_income', 'Total income', sums.income.toLocaleString('en-US'), 2), one('totals', 'total_expenses', 'Total expenses', sums.expenses.toLocaleString('en-US'), 2),
    one('totals', 'noi', 'Net operating income', (sums.income - sums.expenses).toLocaleString('en-US'), 2),
  );
  // One month dropped a digit, so that line no longer adds up to its annual figure.
  const march = truth.find((t) => t.group === 'expenses' && t.row === 2 && t.key === 'm3')!;
  return build(seed, { template: 't12', title: `T-12, ${subject}, ${period}`, subject, period, hoursAgo }, truth,
    { 'expenses.2.m3': { value: march.value.slice(0, -1), confidence: 0.74 }, 'income.1.m7': { confidence: 0.88 } });
}

function financialStatement(seed: number, subject: string, period: string, hoursAgo: number, misread: boolean): ExampleDocument {
  const rand = rng(seed);
  const amount = (base: number) => Math.round(base * (0.7 + rand() * 0.6) / 100) * 100;
  const assets: [string, number][] = [['Cash and deposits', amount(180000)], ['Marketable securities', amount(420000)], ['Real estate owned', amount(1650000)], ['Retirement accounts', amount(510000)], ['Business interests', amount(900000)]];
  const liabilities: [string, number][] = [['Mortgages', amount(820000)], ['Notes payable to banks', amount(140000)], ['Other liabilities', amount(35000)]];
  const sum = (l: [string, number][]) => l.reduce((n, [, v]) => n + v, 0);
  const rows = (group: string, list: [string, number][]): Truth[] => list.flatMap(([name, v], row) => [
    { group, row, key: 'line', label: 'Line', value: name, page: 1 }, { group, row, key: 'amount', label: 'Amount', value: money(v), page: 1 },
  ]);
  const truth = [
    one('borrower', 'name', 'Borrower', subject), one('borrower', 'as_of', 'Statement date', period),
    ...rows('assets', assets), ...rows('liabilities', liabilities),
    one('totals', 'total_assets', 'Total assets', money(sum(assets))), one('totals', 'total_liabilities', 'Total liabilities', money(sum(liabilities))),
    one('totals', 'net_worth', 'Net worth', money(sum(assets) - sum(liabilities))),
  ];
  // A 1 read as a 7 in the leading digit of real estate owned.
  const real = money(assets[2][1]);
  return build(seed, { template: 'financial_statement', title: `Personal financial statement, ${subject}`, subject, period, hoursAgo }, truth,
    misread ? { 'assets.2.amount': { value: real.replace(/^\$\d/, (m) => (m === '$7' ? '$1' : '$7')), confidence: 0.68 }, 'borrower..as_of': { confidence: 0.9 } } : {});
}

function subscription(seed: number, subject: string, period: string, hoursAgo: number, misread: boolean): ExampleDocument {
  const rand = rng(seed);
  const classes: [string, number][] = [['Class A interests', (2 + Math.floor(rand() * 6)) * 250000], ['Class B interests', (1 + Math.floor(rand() * 4)) * 100000]];
  const total = classes.reduce((n, [, v]) => n + v, 0);
  const truth = [
    one('investor', 'name', 'Investor', subject), one('investor', 'entity_type', 'Entity type', ['Family trust', 'Limited liability company', 'Individual'][Math.floor(rand() * 3)]),
    one('investor', 'jurisdiction', 'Jurisdiction', ['Delaware', 'Texas', 'New York'][Math.floor(rand() * 3)]), one('investor', 'accredited', 'Accredited investor box', 'Checked'),
    ...classes.flatMap(([name, v], row): Truth[] => [{ group: 'commitments', row, key: 'class', label: 'Class', value: name, page: 2 }, { group: 'commitments', row, key: 'amount', label: 'Commitment', value: money(v), page: 2 }]),
    one('totals', 'total_commitment', 'Total commitment', money(total), 2),
  ];
  // The total was read with a dropped zero.
  return build(seed, { template: 'subscription', title: `Subscription agreement, ${subject}`, subject, period, hoursAgo }, truth,
    misread ? { 'totals..total_commitment': { value: money(total / 10), confidence: 0.72 }, 'investor..entity_type': { confidence: 0.84 } } : {});
}

export interface ExampleWorkspace {
  vertical: Vertical;
  name: string;
  engagement: string;
  workflows: { name: string; description: string; baselineMinutes: number; basis: string; perDay: number }[];
  request: Pick<ActionItem, 'kind' | 'title' | 'detail'>;
  signoff: string;
  documents: ExampleDocument[];
  /** A fixed "today" (YYYY-MM-DD) for a demo whose dates must not move. */
  today?: string;
}

// The firm names say "Demo" so nobody mistakes one for a client.
export const EXAMPLE_WORKSPACES: Record<'cre' | 'bank' | 'investment' | 'family-office', () => ExampleWorkspace> = {
  cre: () => ({
    vertical: 'CRE', name: 'Demo Property Group', engagement: 'Rent roll and T-12 intake',
    workflows: [
      { name: 'Rent roll intake', description: 'Reads each rent roll as it arrives, extracts units, tenants and rents, and checks that unit rents add up to the stated total.', baselineMinutes: 35, basis: 'Example baseline: 35 minutes to key one rent roll by hand', perDay: 3 },
      { name: 'T-12 normalization', description: 'Maps each T-12 statement to one chart of accounts and checks that the twelve months add up to the annual figure.', baselineMinutes: 50, basis: 'Example baseline: 50 minutes to re-key one T-12', perDay: 2 },
    ],
    request: { kind: 'credentials', title: 'Send a read-only export login for the property system', detail: 'Used for the nightly rent roll export. Read-only is enough.' },
    signoff: 'UAT on 20 sample rent rolls',
    documents: [
      rentRoll(11, 'Maple Court Apartments', 'Oct 2026', 2, 16, true), t12(12, 'Maple Court Apartments', 'Trailing 12 months to Sep 2026', 5),
      rentRoll(13, 'Cedar Landing', 'Oct 2026', 9, 12, false), rentRoll(14, 'Birchwood Flats', 'Oct 2026', 26, 10, true),
      { ...rentRoll(15, 'Elm Street Lofts', 'Sep 2026', 150, 8, false), decided: { status: 'approved', by: 'Priya Raman' } },
    ],
  }),
  bank: () => ({
    vertical: 'BANK', name: 'Demo Community Bank', engagement: 'Borrower package intake',
    workflows: [
      { name: 'Financial statement spreading', description: 'Reads each personal financial statement in a borrower package and checks that assets, liabilities and net worth agree.', baselineMinutes: 40, basis: 'Example baseline: 40 minutes to spread one statement by hand', perDay: 4 },
      { name: 'Borrower package checklist', description: 'Checks each package against the document checklist for its loan type and lists what is missing.', baselineMinutes: 15, basis: 'Example baseline: 15 minutes per package', perDay: 3 },
    ],
    request: { kind: 'documents', title: 'Send 20 redacted sample borrower packages', detail: 'For the accuracy test. Remove account numbers and tax IDs first.' },
    signoff: 'UAT on 20 sample borrower packages',
    documents: [
      financialStatement(21, 'R. Fontaine', 'As of Sep 30, 2026', 3, true), financialStatement(22, 'Greco Family Trust', 'As of Jun 30, 2026', 7, false),
      financialStatement(23, 'N. Kowalski', 'As of Sep 30, 2026', 30, true),
      { ...financialStatement(24, 'T. Haddad', 'As of Mar 31, 2026', 140, false), decided: { status: 'approved', by: 'Priya Raman' } },
    ],
  }),
  investment: () => ({
    vertical: 'INVESTMENT_FIRM', name: 'Demo Capital Partners', engagement: 'Investor onboarding intake',
    workflows: [
      { name: 'Subscription agreement intake', description: 'Reads each subscription agreement, extracts the investor and commitment details, and checks that commitments by class add up to the total.', baselineMinutes: 45, basis: 'Example baseline: 45 minutes to review and key one agreement', perDay: 2 },
      { name: 'Capital call notices', description: 'Prepares a notice per investor from the call schedule and checks each amount against its commitment.', baselineMinutes: 10, basis: 'Example baseline: 10 minutes per notice', perDay: 5 },
    ],
    request: { kind: 'documents', title: 'Send the current subscription agreement template', detail: 'So field positions can be mapped before the first live agreement.' },
    signoff: 'UAT on 15 sample subscription agreements',
    documents: [
      subscription(31, 'Lindqvist Family Trust', 'Fund II', 4, true), subscription(32, 'Mbeki Holdings LLC', 'Fund II', 8, false),
      subscription(33, 'E. Novak', 'Fund II', 28, true),
      { ...subscription(34, 'Jansen Ventures LLC', 'Fund II', 160, false), decided: { status: 'approved', by: 'Priya Raman' } },
    ],
  }),
  'family-office': () => ({
  vertical: 'INVESTMENT_FIRM', name: K1.office, engagement: 'K-1 collection and review', today: K1.today,
  workflows: [
    { name: 'K-1 intake', description: 'Reads each K-1 as it arrives, extracts every box, and checks it against the capital account, last year and the office ledger.', baselineMinutes: 25, basis: 'Example baseline: 25 minutes to key and tie out one K-1 by hand', perDay: 1 },
  ],
  request: { kind: 'documents', title: "Send last year's K-1s for both entities", detail: 'They supply the opening balances the checks compare against.' },
  signoff: "UAT on last year's K-1s",
  documents: k1Documents(),
  }),
};

export function exampleEngagement(w: ExampleWorkspace, day: (offset: number) => string): Engagement {
  const m = (id: string, stage: Engagement['stage'], title: string, status: Engagement['milestones'][number]['status'], due: number, signed?: number) => ({
    id, engagementId: 'eng-1', stage, title, detail: null, dueOn: day(due), status,
    signedOffByName: signed === undefined ? null : 'Alex Morgan', signedOffAt: signed === undefined ? null : new Date(Date.now() + signed * 864e5).toISOString(),
  });
  return {
    id: 'eng-1', name: w.engagement, summary: 'Example engagement. Stages, milestones and dates here are invented to show how the tracker reads.',
    stage: 'integration', stageLabel: 'Integration and QA', status: 'active', nextDeliverable: `${w.signoff} results`, nextDeliverableDue: day(3),
    milestones: [
      m('ms-1', 'discovery', 'Audit report delivered', 'complete', -40, -38), m('ms-2', 'architecture', 'Sandbox walkthrough', 'complete', -20, -19),
      m('ms-3', 'integration', w.signoff, 'awaiting_signoff', 3), m('ms-4', 'integration', 'Export connection to the system of record', 'in_progress', 10),
      m('ms-5', 'production', 'Go-live', 'planned', 24),
    ],
  };
}
