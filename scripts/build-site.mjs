#!/usr/bin/env node
// Builds what Vercel serves: dist/.
//
//   node scripts/build-site.mjs              public site + portal
//   node scripts/build-site.mjs --no-portal  public site only (no npm needed)
//
// dist/ holds exactly two things:
//   1. the public site and the legacy admin app, copied from the PUBLIC list
//      below. Nothing else in the repo is published, so a new file at the
//      repo root is private until it is added here.
//   2. the portal, built by Vite into dist/portal/ (portal/vite.config.ts).
//
// vercel.json points Vercel at this script (buildCommand) and at dist/
// (outputDirectory). scripts/dev-server.mjs --dist previews the result.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const withPortal = !process.argv.includes('--no-portal');

// Files and folders published as they are. Folders are copied whole.
const PUBLIC = [
  'index.html', 'shell.html', 'app.js', 'styles.css',
  'logo.svg', 'logo-mark.svg', 'robots.txt', 'sitemap.xml',
  'assets', 'marketing',
  // Prerendered public pages (scripts/prerender.mjs).
  'solutions', 'case-studies', 'for-advisors', 'capabilities', 'how-we-work', 'security', 'tools', 'contact',
];

// Never published, whatever folder they turn up in.
const SKIP = /(^|\/)(\.DS_Store|Thumbs\.db|.*\.md|.*\.map|\.env.*)$/i;

const fail = (message) => { console.error(`build-site: ${message}`); process.exit(1); };

function copy(from, to) {
  const stat = fs.statSync(from);
  if (stat.isDirectory()) {
    fs.mkdirSync(to, { recursive: true });
    for (const name of fs.readdirSync(from)) copy(path.join(from, name), path.join(to, name));
  } else if (!SKIP.test(path.relative(root, from))) {
    fs.copyFileSync(from, to);
  }
}

// ── 1. Public site ────────────────────────────────────────────
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
for (const entry of PUBLIC) {
  const from = path.join(root, entry);
  if (!fs.existsSync(from)) fail(`"${entry}" is on the PUBLIC list but does not exist.`);
  copy(from, path.join(dist, entry));
}

// ── 2. Portal ─────────────────────────────────────────────────
if (withPortal) {
  const portal = path.join(root, 'portal');
  if (!fs.existsSync(path.join(portal, 'node_modules'))) {
    fail('portal/node_modules is missing. Run `npm --prefix portal ci` first (Vercel does this through installCommand).');
  }
  const built = spawnSync('npm', ['run', 'build'], { cwd: portal, stdio: 'inherit' });
  if (built.status !== 0) fail('the portal build failed.');
}

// ── 3. Checks ─────────────────────────────────────────────────
// A deploy that would 404 on a page the site links to should fail here, not
// in front of a client.
const problems = [];
const inDist = (urlPath) => {
  let file = path.join(dist, decodeURIComponent(urlPath.split(/[?#]/)[0]));
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  return fs.existsSync(file);
};

// Every local file a page loads must have been copied.
const localRefs = (html) => [...html.matchAll(/\s(?:src|href)="(\/[^"/][^"]*)"/g)]
  .map((m) => m[1])
  .filter((ref) => /\.[a-z0-9]+([?#].*)?$/i.test(ref));   // files only, not page links
for (const page of ['shell.html', 'index.html']) {
  for (const ref of localRefs(fs.readFileSync(path.join(dist, page), 'utf8'))) {
    if (!inDist(ref)) problems.push(`${page} loads ${ref}, which is not in dist/. Add it to PUBLIC.`);
  }
}

// Every page in the sitemap must exist as a prerendered file.
const sitemap = fs.readFileSync(path.join(dist, 'sitemap.xml'), 'utf8');
for (const [, loc] of sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)) {
  const pathname = new URL(loc).pathname;
  if (!inDist(pathname)) problems.push(`sitemap.xml lists ${pathname}, which is not in dist/. Add its folder to PUBLIC.`);
}

if (withPortal) {
  const index = path.join(dist, 'portal', 'index.html');
  if (!fs.existsSync(index)) problems.push('dist/portal/index.html is missing after the portal build.');
  else for (const ref of localRefs(fs.readFileSync(index, 'utf8'))) {
    if (!inDist(ref)) problems.push(`portal/index.html loads ${ref}, which is not in dist/.`);
  }
}

// Nothing private may have come along.
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
const files = walk(dist);
for (const file of files) {
  const rel = path.relative(dist, file);
  if (SKIP.test(rel) || /(^|\/)(server|docs|scripts|node_modules|tests?)\//.test(rel)) problems.push(`${rel} must not be published.`);
}

if (problems.length) fail(`\n  - ${problems.join('\n  - ')}`);

const bytes = files.reduce((sum, f) => sum + fs.statSync(f).size, 0);
console.log(`build-site: dist/ ready, ${files.length} files, ${(bytes / 1024 / 1024).toFixed(1)} MB${withPortal ? '' : ' (portal skipped)'}`);
