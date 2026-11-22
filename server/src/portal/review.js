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
 * The templates themselves are one definition: ./templates.json.
 */
// Shared with the portal's Demo Mode: portal/src/demo/templates.json is a copy
// of this file, and tests/review.test.js fails if the two differ.
const TEMPLATES = require('./templates.json');

/** "$1,450.00" -> 1450, "(250)" -> -250, "93.8%" -> 93.8, "1,5O0" -> NaN. */
function num(value) {
  const s = String(value == null ? '' : value).trim();
  if (!/^\(?-?\$?\d[\d,]*(\.\d+)?%?\)?$|^\(?-?\$?\.\d+%?\)?$/.test(s)) return NaN;
  const n = Number(s.replace(/[$,%()-]/g, ''));
  return /^\(|^-/.test(s) ? -n : n;
}

const fmt = (n) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

// The check kinds a K-1 needs. Missing or empty figures count as zero, since
// most boxes on a K-1 are blank. This function is the same in
// server/src/portal/review.js and portal/src/demo/checks.ts: change both.
function moreKinds(c, fields, h) {
  const { single, result, missing, compare } = h;
  const blank = (f) => !f || String(f.value == null ? '' : f.value).trim() === '';
  const val = (path) => {
    const [group, key] = path.split('.');
    if (key.endsWith('*')) return fields.filter((f) => f.group === group && f.row == null && f.key.startsWith(key.slice(0, -1))).reduce((n, f) => n + (blank(f) ? 0 : num(f.value)), 0);
    const f = single(path);
    return blank(f) ? 0 : num(f.value);
  };
  const norm = (v) => String(v == null ? '' : v).toLowerCase().replace(/[^a-z0-9.]/g, '');
  const yes = (f) => !!f && /^(yes|x|true|checked)$/i.test(String(f.value).trim());

  if (c.kind === 'formula') {
    const target = single(c.equals);
    if (blank(target) || (c.needs || []).some((p) => !single(p))) return missing(c, 'a figure it needs is not on this document or in the office records');
    if (c.whenPositive && !(val(c.whenPositive) > 0)) return missing(c, 'it only applies when the larger figure is a gain');
    const got = c.terms.reduce((n, t) => n + (t[0] === '-' ? -1 : 1) * val(t.slice(1)), 0);
    const want = num(target.value);
    if (Number.isNaN(got) || Number.isNaN(want)) return result(c, 'fail', 'A figure this check uses cannot be read as a number.');
    const tolerance = c.tolerance == null ? 0.01 : c.tolerance;
    if (c.op !== 'lte') return compare(c, got, want, tolerance, 'The calculation gives');
    return got <= want + tolerance
      ? result(c, 'pass', `${fmt(got)} is not more than ${fmt(want)}.`)
      : result(c, 'fail', `${fmt(got)} is more than "${target.label}" (${fmt(want)}).`);
  }
  if (c.kind === 'match') {
    const pairs = c.pairs.map(([a, b]) => [single(a), single(b)]);
    if (pairs.some(([a, b]) => !a || !b)) return missing(c, 'a value it compares is not on this document or in the office records');
    const off = pairs.filter(([a, b]) => norm(a.value) !== norm(b.value));
    return off.length
      ? result(c, 'fail', `Does not match the office records: ${off.map(([a]) => a.label).join('; ')}.`)
      : result(c, 'pass', 'Every value matches the office records.');
  }
  if (c.kind === 'compare') {
    const base = fields.filter((f) => f.group === c.against && f.row == null);
    const off = [];
    let compared = 0;
    for (const b of base) {
      const f = fields.find((x) => c.groups.includes(x.group) && x.row == null && x.key === b.key);
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
      const odd = fields.filter((f) => f.group === c.group && f.row == null && c.prefixes.some((p) => f.key.startsWith(p)) && !c.known.includes(f.key));
      return odd.length ? result(c, 'fail', `Not seen by the office before: ${odd.map((f) => f.label).join('; ')}.`) : result(c, 'pass', 'Every code has been seen before.');
    }
    if (c.test === 'changed') {
      const [a, b] = [single(c.field), single(c.against)];
      if (!a || !b) return missing(c, 'there is no figure from last year to compare with');
      return norm(a.value) !== norm(b.value) && !yes(single(c.unless))
        ? result(c, 'fail', `"${a.label}" was ${b.value} last year and is ${a.value} now, with no transfer on record.`)
        : result(c, 'pass', 'Unchanged, or a transfer is on record.');
    }
    const low = fields.filter((f) => typeof f.confidence === 'number' && f.confidence < c.below && !f.editedAt && !f.approvedAt);
    return low.length ? result(c, 'fail', `Read with low confidence and not yet confirmed: ${low.map((f) => f.label).join('; ')}.`) : result(c, 'pass', 'No low-confidence field is waiting.');
  }
  return null;
}

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
    const more = moreKinds(c, fields, { single, result, missing, compare });
    if (more) return more;
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
