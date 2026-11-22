// The field list of one sample K-1, built from k1-data.json.
//
// Used twice: by the demo (k1.ts) and by scripts/k1-pdfs.mjs, which draws the
// sample PDFs from the same list, so a field and its place on the page cannot
// disagree. Keep this file free of imports and of non-erasable TypeScript:
// Node runs it directly.
//
// Box and code labels are for a fictional sample. Have an accountant confirm
// the wording before it is used on real K-1s.

export interface K1Doc {
  layout: string; ein: string; city: string; j: string; k3?: boolean; k_qualified?: string;
  capital: Record<string, string>; boxes: Record<string, string>; coded: Record<string, string>;
  prior?: Record<string, string>; estimate?: Record<string, string>; ledger?: string;
  misreads?: Record<string, { value: string; confidence: number }>; started?: string[];
}
export interface K1Row { slug: string; investment: string; entity: string; doc?: K1Doc }
export interface K1Entity { name: string; tin: string; type: string }
export interface K1Truth { group: string; key: string; label: string; value: string }

const BOXES: [string, string][] = [
  ['1', '1 Ordinary business income (loss)'], ['2', '2 Net rental real estate income (loss)'], ['3', '3 Other net rental income (loss)'],
  ['4a', '4a Guaranteed payments for services'], ['4b', '4b Guaranteed payments for capital'], ['4c', '4c Total guaranteed payments'],
  ['5', '5 Interest income'], ['6a', '6a Ordinary dividends'], ['6b', '6b Qualified dividends'], ['6c', '6c Dividend equivalents'],
  ['7', '7 Royalties'], ['8', '8 Net short-term capital gain (loss)'], ['9a', '9a Net long-term capital gain (loss)'],
  ['9b', '9b Collectibles (28%) gain (loss)'], ['9c', '9c Unrecaptured section 1250 gain'], ['10', '10 Net section 1231 gain (loss)'],
  ['12', '12 Section 179 deduction'], ['14', '14 Self-employment earnings (loss)'], ['15', '15 Credits'], ['16', '16 Schedule K-3 is attached'],
  ['17', '17 Alternative minimum tax items'], ['21', '21 Foreign taxes paid or accrued'],
  ['22', '22 More than one activity for at-risk purposes'], ['23', '23 More than one activity for passive activity purposes'],
];
const CODES: Record<string, string> = {
  '11A': 'Other portfolio income (loss)', '11ZZ': 'Other income (loss)', '13H': 'Investment interest expense', '18A': 'Tax-exempt interest income',
  '18C': 'Nondeductible expenses', '19A': 'Distributions: cash and marketable securities', '20A': 'Investment income', '20B': 'Investment expenses',
  '20Z': 'Section 199A information',
};
const CAPITAL: [string, string][] = [
  ['beginning', 'Beginning capital account'], ['contributed', 'Capital contributed during the year'], ['net_income', 'Current year net income (loss)'],
  ['other', 'Other increase (decrease)'], ['distributions', 'Withdrawals and distributions'], ['ending', 'Ending capital account'],
];
const label = (key: string) => BOXES.find(([k]) => k === key)?.[1] ?? CAPITAL.find(([k]) => k === key)?.[1] ?? (CODES[key] ? `${key} ${CODES[key]}` : key === 'j_capital' ? 'J Share of capital, ending' : key);

export function k1Truth(row: K1Row, entity: K1Entity): K1Truth[] {
  const d = row.doc as K1Doc;
  const t = (group: string, key: string, text: string, value: string): K1Truth => ({ group, key, label: text, value });
  return [
    t('part1', 'ein', "A Partnership's EIN", d.ein),
    t('part1', 'name', "B Partnership's name and address", `${row.investment}, LP, ${d.city}`),
    t('part1', 'irs_center', 'C IRS center where the partnership filed', 'E-file'),
    t('part1', 'ptp', 'D Publicly traded partnership', 'No'),
    t('part1', 'final', 'Final K-1', 'No'),
    t('part1', 'amended', 'Amended K-1', 'No'),
    t('part2', 'partner_tin', "E Partner's TIN", entity.tin),
    t('part2', 'partner_name', "F Partner's name", entity.name),
    t('part2', 'gp_lp', 'G General or limited partner', 'Limited partner'),
    t('part2', 'domestic', 'H1 Domestic or foreign partner', 'Domestic'),
    t('part2', 'entity_type', 'I1 Type of entity', entity.type),
    t('part2', 'j_profit', 'J Share of profit, ending', d.j),
    t('part2', 'j_loss', 'J Share of loss, ending', d.j),
    t('part2', 'j_capital', 'J Share of capital, ending', d.j),
    t('part2', 'k_nonrecourse', 'K Nonrecourse liabilities, ending', '0'),
    t('part2', 'k_qualified', 'K Qualified nonrecourse financing, ending', d.k_qualified ?? '0'),
    t('part2', 'k_recourse', 'K Recourse liabilities, ending', '0'),
    t('part2', 'm', 'M Contributed property with a built-in gain or loss', 'No'),
    t('part2', 'n_end', 'N Net unrecognized Section 704(c) gain or loss, ending', '0'),
    ...CAPITAL.map(([key, text]) => t('capital', key, `L ${text}`, d.capital[key])),
    ...BOXES.map(([key, text]) => t('part3', key, text, key === '16' ? (d.k3 ? 'Yes' : 'No') : key === '22' || key === '23' ? 'No' : d.boxes[key] ?? '')),
    ...Object.entries(d.coded).map(([key, value]) => t('coded', key, label(key), value)),
    // What the office already holds, to check the K-1 against.
    t('records', 'partnership_ein', "Partnership's EIN on file", d.ein),
    t('records', 'partner_name', "Partner's name on file", entity.name),
    t('records', 'partner_tin', "Partner's TIN on file", entity.tin),
    ...(d.ledger === undefined ? [] : [t('records', 'ledger_distributions', `Distributions in the office ledger`, d.ledger)]),
    t('records', 'transfer', 'Transfer of interest recorded this year', 'No'),
    ...Object.entries(d.prior ?? {}).map(([key, value]) => t('prior', key, label(key), value)),
    ...(d.prior ? [t('prior', 'j_capital', label('j_capital'), d.j)] : []),
    ...Object.entries(d.estimate ?? {}).map(([key, value]) => t('estimate', key, label(key), value)),
  ];
}
