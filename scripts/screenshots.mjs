// Captures the product screenshots used on the public site into assets/shots/.
//
//   npm run build && npm run preview        (in another terminal)
//   node scripts/screenshots.mjs [base]     (base defaults to http://localhost:4173)
//
// Sources are MonkFlow's own demos with synthetic data: the portal's Demo Mode
// (/demo/*, runs in the browser) and the two public demo sites. No client data.
// Needs the Playwright that portal/ already installs, and cwebp (brew install webp).
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(path.join(root, 'portal/package.json'))('@playwright/test');
const base = process.argv[2] || 'http://localhost:4173';
const out = path.join(root, 'assets/shots');
const WIDTH = 1280, HEIGHT = 800;

// name, url, an optional step to reach the screen worth showing, and an
// optional selector to capture one element instead of the whole window.
const SHOTS = [
  ['review-bank', `${base}/demo/bank/review`, async (page) => {
    await page.getByRole('row').nth(1).getByRole('link').first().click();
    await page.waitForURL(/\/review\/.+/);
  }],
  ['review-cre', `${base}/demo/cre/review`, async (page) => {
    await page.getByRole('row').nth(1).getByRole('link').first().click();
    await page.waitForURL(/\/review\/.+/);
  }],
  ['review-investment', `${base}/demo/investment/review`, async (page) => {
    await page.getByRole('row').nth(1).getByRole('link').first().click();
    await page.waitForURL(/\/review\/.+/);
  }],
  ['lending', 'https://lending.monkflow.io', async (page) => {
    await page.getByRole('link', { name: /Open borrower portal/ }).first().click();
    await page.waitForLoadState('networkidle');
  }],
  // The walkthrough video's first frame only, not the page around it.
  ['land', 'https://demo.monkflow.io', null, 'video'],
];

fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
for (const [name, url, step, clip] of SHOTS) {
  if (process.argv[3] && process.argv[3] !== name) continue;
  await page.goto(url, { waitUntil: 'networkidle' });
  if (step) await step(page);
  await page.waitForTimeout(600);
  const png = path.join(out, `${name}.png`);
  await (clip ? page.locator(clip).first() : page).screenshot({ path: png });
  execFileSync('cwebp', ['-quiet', '-q', '80', '-resize', String(WIDTH * 1.5), '0', png, '-o', path.join(out, `${name}.webp`)]);
  fs.rmSync(png);
  console.log(`screenshots: ${name}.webp`);
}
await browser.close();
