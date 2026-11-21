/**
 * Review queue vocabulary: document templates, their reconciliation checks,
 * and the shapes the API returns.
 *
 * A template names the groups a document's fields fall into and the checks
 * that must hold between them. Checks are computed from the current field
 * values on every read, so an edit re-runs them; nothing is stored.
 *
 * The portal's Demo Mode has its own copy of the evaluator
 * (portal/src/demo/checks.ts) because it runs with no API. Change both.
 */
const MONTHS = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'm10', 'm11', 'm12'];

const TEMPLATES = {
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
};

/** "$1,450.00" -> 1450, "(250)" -> -250, "93.8%" -> 93.8, "1,5O0" -> NaN. */
function num(value) {
  const s = String(value == null ? '' : value).trim();
  if (!/^\(?-?\$?\d[\d,]*(\.\d+)?%?\)?$|^\(?-?\$?\.\d+%?\)?$/.test(s)) return NaN;
  const n = Number(s.replace(/[$,%()-]/g, ''));
  return /^\(|^-/.test(s) ? -n : n;
}

const fmt = (n) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

function runChecks(templateKey, fields) {
  const template = TEMPLATES[templateKey];
  if (!template) return [];
  const single = (path) => {
    const [group, key] = path.split('.');
    return fields.find((f) => f.group === group && f.key === key && f.row == null);
  };
  const result = (c, status, detail) => ({ id: c.id, label: c.label, blocking: !!c.blocking, status, detail });
  const missing = (c, what) => result(c, 'na', `Not checked: ${what}.`);
  const unreadable = (c, f) => result(c, 'fail', `"${f.label}"${f.row != null ? ` in row ${f.row + 1}` : ''} cannot be read as a number.`);
  const compare = (c, got, want, tolerance, said) => (Math.abs(got - want) <= tolerance
    ? result(c, 'pass', `${said} ${fmt(got)}, as stated.`)
    : result(c, 'fail', `${said} ${fmt(got)}; the document states ${fmt(want)} (difference ${fmt(Math.abs(got - want))}).`));

  return template.checks.map((c) => {
    if (c.kind === 'sum') {
      const parts = fields.filter((f) => f.group === c.group && f.key === c.key && f.row != null);
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
    // rowsum: within each row, the listed keys add up to the row's total.
    const rows = [...new Set(fields.filter((f) => f.group === c.group && f.row != null).map((f) => f.row))];
    if (!rows.length) return missing(c, 'the document has no rows in this section');
    const off = [];
    for (const row of rows) {
      const cell = (key) => fields.find((f) => f.group === c.group && f.row === row && f.key === key);
      const cells = [...c.keys.map(cell), cell(c.total)];
      if (cells.some((f) => !f)) return missing(c, `row ${row + 1} is missing a month or its annual figure`);
      const bad = cells.find((f) => Number.isNaN(num(f.value)));
      if (bad) return unreadable(c, bad);
      const sum = cells.slice(0, -1).reduce((n, f) => n + num(f.value), 0);
      if (Math.abs(sum - num(cell(c.total).value)) > 0.01) off.push(row + 1);
    }
    return off.length
      ? result(c, 'fail', `${off.length} of ${rows.length} rows do not add up: row ${off.join(', ')}.`)
      : result(c, 'pass', `All ${rows.length} rows add up.`);
  });
}

// Confidence below this is flagged for a person to look at.
const FLAG_BELOW = 0.95;

function summary(row) {
  const fields = row.fields || [];
  const checks = runChecks(row.template, fields);
  const scored = fields.filter((f) => typeof f.confidence === 'number');
  return {
    id: row.id,
    title: row.title,
    template: row.template,
    templateLabel: (TEMPLATES[row.template] || {}).label || row.template,
    subject: row.subject,
    period: row.period,
    workflowId: row.workflow_id,
    workflowName: row.workflow_name || null,
    status: row.status,
    receivedAt: row.received_at,
    fieldCount: fields.length,
    flagged: scored.filter((f) => f.confidence < FLAG_BELOW && !f.editedAt).length,
    lowestConfidence: scored.length ? Math.min(...scored.map((f) => f.confidence)) : null,
    checksPassed: checks.filter((c) => c.status === 'pass').length,
    checksTotal: checks.filter((c) => c.status !== 'na').length,
    blocked: checks.some((c) => c.blocking && c.status === 'fail'),
    decidedByName: row.decided_by_name,
    decidedAt: row.decided_at,
  };
}

function detail(row) {
  return {
    ...summary(row),
    groups: (TEMPLATES[row.template] || { groups: [] }).groups,
    fields: row.fields || [],
    checks: runChecks(row.template, row.fields || []),
    decisionReason: row.decision_reason,
    // 'none' = the pipeline sent no file; 'purged' = deleted at its retention date.
    document: !row.document_id ? 'none' : row.document_purged ? 'purged' : 'available',
    documentName: row.document_name || null,
    documentPurgeAfter: row.document_purge_after || null,
  };
}

const csvCell = (v) => {
  const s = String(v == null ? '' : v);
  // A leading = + - @ would run as a formula when the file is opened in Excel.
  const safe = /^[=+\-@\t\r]/.test(s) && Number.isNaN(num(s)) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

function toCsv(row) {
  const groups = Object.fromEntries(((TEMPLATES[row.template] || {}).groups || []).map((g) => [g.key, g.label]));
  const lines = [['Section', 'Row', 'Field', 'Value', 'Extracted value', 'Confidence', 'Page', 'Edited by', 'Edited at']];
  for (const f of row.fields || []) {
    lines.push([groups[f.group] || f.group, f.row == null ? '' : f.row + 1, f.label, f.value, f.original == null ? f.value : f.original,
      f.confidence == null ? '' : f.confidence, f.page == null ? '' : f.page, f.editedByName || '', f.editedAt || '']);
  }
  return lines.map((l) => l.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

module.exports = { TEMPLATES, FLAG_BELOW, num, runChecks, summary, detail, toCsv, csvCell };
