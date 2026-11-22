// Draws the sample K-1s for the family-office demo from src/demo/k1-data.json.
//
//   node portal/scripts/k1-pdfs.mjs      (needs Chrome; re-run after changing the data)
//
// For each K-1 it writes public/k1/<slug>.pdf, one PNG per page, and the place
// of every field on its page into src/demo/k1-boxes.json. The review screen
// shows the PNGs and draws the highlight from those boxes.
//
// The pages are laid out like a Schedule K-1 but are not the IRS form, and
// every one is marked as a fictional sample.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { k1Truth } from '../src/demo/k1-fields.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(readFileSync(join(root, 'src/demo/k1-data.json'), 'utf8'));
const out = join(root, 'public/k1');
mkdirSync(out, { recursive: true });

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const DRAWN = ['part1', 'part2', 'capital', 'part3', 'coded'];
const TITLES = { part1: 'Part I  Information about the partnership', part2: 'Part II  Information about the partner', capital: 'L  Partner\'s capital account analysis', part3: 'Part III  Partner\'s share of current year income, deductions, credits and other items', coded: 'Coded items' };

const css = `
  * { box-sizing: border-box; margin: 0; }
  body { font: 10px/1.25 Helvetica, Arial, sans-serif; color: #111; }
  .pg { width: 816px; height: 1056px; padding: 34px 38px; position: relative; page-break-after: always; overflow: hidden; background: #fff; }
  .sample { position: absolute; top: 12px; right: 38px; font-size: 9px; letter-spacing: .08em; color: #a33; text-transform: uppercase; }
  h1 { font-size: 15px; } h1 small { font-weight: 400; font-size: 10px; margin-left: 8px; }
  h2 { font-size: 9.5px; background: #111; color: #fff; padding: 3px 6px; margin-top: 8px; }
  .cols { display: grid; grid-template-columns: 1fr 1.15fr; gap: 14px; margin-top: 8px; }
  .c { border: 1px solid #555; border-top: 0; padding: 3px 6px; display: flex; justify-content: space-between; gap: 8px; min-height: 23px; align-items: center; }
  .c i { font-style: normal; color: #333; } .c b { font: 600 11px 'Courier New', monospace; white-space: nowrap; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; } .grid .c:nth-child(even) { border-left: 0; }
  .stmt h1 { font: 700 18px Georgia, serif; } .stmt p { margin-top: 4px; color: #444; }
  .stmt table { width: 100%; border-collapse: collapse; margin-top: 6px; font: 11px Georgia, serif; }
  .stmt th { text-align: left; border-bottom: 2px solid #111; padding: 4px 6px; font-size: 9.5px; text-transform: uppercase; }
  .stmt td { border-bottom: 1px solid #ccc; padding: 5px 6px; } .stmt td:last-child, .stmt th:last-child { text-align: right; font-variant-numeric: tabular-nums; }
  .stmt h2 { background: none; color: #111; font: 700 12px Georgia, serif; border-bottom: 0; padding: 0; margin-top: 18px; }
`;
const cell = (t) => `<div class="c" data-f="${t.group}.${t.key}"><i>${esc(t.label)}</i><b>${esc(t.value)}</b></div>`;
const mark = '<div class="sample">Sample · fictional data · not an IRS form</div>';

function standard(row, truth) {
  const of = (g) => truth.filter((t) => t.group === g);
  return `<div class="pg">${mark}<h1>Schedule K-1 (Form 1065)<small>Partner's Share of Income, Deductions, Credits, etc. · Tax year ${data.taxYear}</small></h1>
    <div class="cols"><div>
      <h2>${TITLES.part1}</h2>${of('part1').map(cell).join('')}
      <h2>${TITLES.part2}</h2>${of('part2').map(cell).join('')}
      <h2>${TITLES.capital}</h2>${of('capital').map(cell).join('')}
    </div><div>
      <h2>${TITLES.part3}</h2><div class="grid">${of('part3').map(cell).join('')}</div>
      <h2>${TITLES.coded}</h2>${of('coded').map(cell).join('')}
    </div></div></div>`;
}

// A fund administrator's own package: same information, different order, wording and pages.
function statement(row, truth) {
  const table = (g, head) => `<h2>${head}</h2><table><tr><th>Item</th><th>Amount or entry</th></tr>${truth.filter((t) => t.group === g).map((t) => `<tr data-f="${t.group}.${t.key}"><td>${esc(t.label)}</td><td>${esc(t.value)}</td></tr>`).join('')}</table>`;
  const head = `<h1>${esc(row.investment)}, LP</h1><p>Partner tax package, tax year ${data.taxYear} · Schedule K-1 information prepared by the fund administrator</p>`;
  return `<div class="pg stmt">${mark}${head}${table('part2', 'Your details')}${table('capital', 'Your capital account')}${table('part1', 'The partnership')}</div>
    <div class="pg stmt">${mark}${head}${table('coded', 'Items reported with a code')}${table('part3', 'Income, deductions and other items by box')}</div>`;
}

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 816, height: 1056 }, deviceScaleFactor: 1.5 });
const boxes = {};
for (const row of data.k1s.filter((r) => r.doc)) {
  const truth = k1Truth(row, data.entities[row.entity]).filter((t) => DRAWN.includes(t.group));
  await page.setContent(`<style>${css}</style>${(row.doc.layout === 'statement' ? statement : standard)(row, truth)}`);
  await page.pdf({ path: join(out, `${row.slug}.pdf`), width: '8.5in', height: '11in', printBackground: true });
  const pages = await page.locator('.pg').all();
  for (const [i, pg] of pages.entries()) await pg.screenshot({ path: join(out, `${row.slug}-${i + 1}.png`) });
  const found = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-f]')].map((el) => {
    const pg = el.closest('.pg'); const [a, b] = [el.getBoundingClientRect(), pg.getBoundingClientRect()];
    const r = (n) => Math.round(n * 10000) / 10000;
    return [el.dataset.f, [[...document.querySelectorAll('.pg')].indexOf(pg) + 1, r((a.x - b.x) / b.width), r((a.y - b.y) / b.height), r(a.width / b.width), r(a.height / b.height)]];
  })));
  const lost = truth.filter((t) => !found[`${t.group}.${t.key}`] || found[`${t.group}.${t.key}`][2] + found[`${t.group}.${t.key}`][4] > 1);
  if (lost.length) throw new Error(`${row.slug}: not on the page: ${lost.map((t) => t.key).join(', ')}`);
  boxes[row.slug] = { pages: pages.length, boxes: found };
  console.log(`${row.slug}: ${pages.length} page(s), ${truth.length} fields`);
}
await browser.close();
writeFileSync(join(root, 'src/demo/k1-boxes.json'), JSON.stringify(boxes) + '\n');
