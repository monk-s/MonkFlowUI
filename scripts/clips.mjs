// Records the short product clips used on the public site into assets/shots/.
//
//   npm run build && npm run preview        (in another terminal)
//   node scripts/clips.mjs [base]           (base defaults to http://localhost:4173)
//
// Same sources as scripts/screenshots.mjs: MonkFlow's own demos, synthetic data.
// Needs the Playwright that portal/ installs, and ffmpeg (brew install ffmpeg).
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(path.join(root, 'portal/package.json'))('@playwright/test');
const base = process.argv[2] || 'http://localhost:4173';
const out = path.join(root, 'assets/shots');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mk-clips-'));
const size = { width: 1280, height: 800 };
const only = process.argv[3];

// Recordings have no mouse pointer, so the page draws one.
const POINTER = () => {
  const dot = document.createElement('div');
  dot.style.cssText = 'position:fixed;z-index:99999;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:rgba(18,35,58,.35);border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);pointer-events:none;left:-50px;top:-50px;transition:transform .12s';
  addEventListener('DOMContentLoaded', () => document.body.appendChild(dot));
  addEventListener('mousemove', (e) => { dot.style.left = e.clientX + 'px'; dot.style.top = e.clientY + 'px'; }, true);
  addEventListener('mousedown', () => { dot.style.transform = 'scale(.6)'; }, true);
  addEventListener('mouseup', () => { dot.style.transform = ''; }, true);
};

// mp4 for every browser, no sound, small enough to autoplay.
const encode = (input, name, extra = [], speed = 1) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...extra, '-i', input,
  '-an', '-vf', `setpts=PTS/${speed},scale=1280:-2,fps=24`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '30', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
  path.join(out, `${name}.mp4`)]);

async function record(name, url, steps) {
  if (only && only !== name) return;
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: size, recordVideo: { dir: tmp, size } });
  await context.addInitScript(POINTER);
  const page = await context.newPage();
  const began = Date.now();
  await page.goto(url, { waitUntil: 'networkidle' });
  const skip = (Date.now() - began) / 1000; // drop the blank loading frames
  const point = async (locator) => {
    const box = await locator.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 28 });
    await page.waitForTimeout(350);
  };
  const click = async (locator) => { await point(locator); await locator.click(); await page.waitForTimeout(900); };
  await page.mouse.move(640, 420);
  await page.waitForTimeout(700);
  await steps(page, { point, click });
  await page.waitForTimeout(900);
  const video = await page.video().path();
  await context.close();
  await browser.close();
  encode(video, name, ['-ss', skip.toFixed(2)]);
  console.log(`clips: ${name}.mp4`);
}

fs.mkdirSync(out, { recursive: true });

await record('review-bank', `${base}/demo/bank/review`, async (page, { point, click }) => {
  await click(page.getByRole('row').nth(1).getByRole('link').first());
  await point(page.getByText('$7,435,500.00').first());
  await page.waitForTimeout(900);
  await click(page.getByRole('tab', { name: /Checks/ }));
  await page.waitForTimeout(900);
  await click(page.getByRole('tab', { name: /Fields/ }));
});

// Start on a borrower's checklist (the first sample loan), not the demo's landing page.
const lendingHome = await (await fetch('https://lending.monkflow.io')).text();
const portal = 'https://lending.monkflow.io' + lendingHome.match(/href="(\/portal\.php\?t=[^"]+)"/)[1];
await record('lending', portal, async (page) => {
  for (let i = 0; i < 60; i++) { await page.mouse.wheel(0, 22); await page.waitForTimeout(100); }
});

// The land search already has a recorded walkthrough; take its middle
// (boundary, parcels, address sheet, report) at three times the speed.
if (!only || only === 'land') {
  const src = path.join(tmp, 'land.mp4');
  execFileSync('curl', ['-sSfL', 'https://demo.monkflow.io/MonkFlow_Land_Search_90s.mp4', '-o', src]);
  encode(src, 'land', ['-ss', '14', '-t', '33'], 3);
  console.log('clips: land.mp4');
}
fs.rmSync(tmp, { recursive: true, force: true });
