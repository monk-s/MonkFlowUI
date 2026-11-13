#!/usr/bin/env node
// Local preview that behaves like the Vercel deployment. It reads vercel.json
// and applies it in Vercel's order: redirects, then files, then rewrites.
//
//   node scripts/dev-server.mjs [port] [--dist]      default port 4173
//
//   (no flag)  serves the repo root, so edits to the public site and app.js
//              show on refresh with no build. /portal/* comes from the last
//              portal build in dist/portal (npm run build), if there is one.
//   --dist     serves dist/ only: exactly what Vercel will publish.
//              Run `npm run build` first.
//
// /api/* is passed to a local API instead of production:
//   API_TARGET=http://127.0.0.1:8787 node scripts/dev-server.mjs
// (default http://127.0.0.1:8080). For the sample portal API:
//   cd server && PORT=8787 FRONTEND_URL=http://localhost:4173 node scripts/dev-portal.js
// FRONTEND_URL must be this preview's address, or the API refuses writes
// from it as cross-site.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const useDist = args.includes('--dist');
const port = Number(args.find((a) => /^\d+$/.test(a))) || 4173;
const apiTarget = new URL(process.env.API_TARGET || 'http://127.0.0.1:8080');
const dist = path.join(repo, 'dist');
const root = useDist ? dist : repo;

if (useDist && !fs.existsSync(path.join(dist, 'shell.html'))) {
  console.error('dist/ has not been built. Run `npm run build` first.');
  process.exit(1);
}

const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
  '.json': 'application/json', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2',
};

// ── vercel.json ───────────────────────────────────────────────
// The subset of Vercel's `source` syntax this repo uses: literal text,
// :name, :name* and (regex) groups.
function compile(source) {
  let out = '';
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === '(') {
      let depth = 0; let j = i;
      for (; j < source.length; j++) { if (source[j] === '(') depth++; if (source[j] === ')' && --depth === 0) break; }
      out += source.slice(i, j + 1); i = j;
    } else if (ch === ':') {
      const name = /^[A-Za-z0-9_]+/.exec(source.slice(i + 1))?.[0] || '';
      i += name.length;
      if (source[i + 1] === '*') {
        i++;
        // "/:path*" also matches with the slash and everything after it absent.
        if (out.endsWith('/')) out = `${out.slice(0, -1)}(?:/(?<${name}>.*))?`; else out += `(?<${name}>.*)`;
      } else out += `(?<${name}>[^/]+)`;
    } else out += ch.replace(/[.*+?^${}|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${out}$`);
}

function loadConfig() {
  const config = JSON.parse(fs.readFileSync(path.join(root === dist && fs.existsSync(path.join(dist, 'vercel.json')) ? dist : repo, 'vercel.json'), 'utf8'));
  const prepare = (list) => (list || []).map((rule) => ({ ...rule, match: compile(rule.source) }));
  return { redirects: prepare(config.redirects), rewrites: prepare(config.rewrites), headers: prepare(config.headers) };
}

// ── Files ─────────────────────────────────────────────────────
function fileFor(pathname) {
  // In source mode the portal's built files live in dist/portal.
  const base = !useDist && (pathname === '/portal' || pathname.startsWith('/portal/')) ? dist : root;
  let file = path.join(base, pathname);
  if (file !== base && !file.startsWith(base + path.sep)) return null;
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  return fs.existsSync(file) && fs.statSync(file).isFile() ? file : null;
}

function send(res, file, extraHeaders) {
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store', ...extraHeaders });
  fs.createReadStream(file).pipe(res);
}

function proxy(req, res) {
  const upstream = http.request({
    hostname: apiTarget.hostname, port: apiTarget.port || 80, method: req.method, path: req.url,
    headers: { ...req.headers, host: apiTarget.host },
  }, (up) => { res.writeHead(up.statusCode, up.headers); up.pipe(res); });
  upstream.on('error', () => {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: `Local preview: no API is answering at ${apiTarget.origin}. Start one, or set API_TARGET.` } }));
  });
  req.pipe(upstream);
}

http.createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400); return res.end(); }
  const config = loadConfig();   // re-read each request so edits to vercel.json apply on refresh

  const redirect = config.redirects.find((r) => r.match.test(pathname));
  if (redirect) { res.writeHead(redirect.permanent ? 308 : 307, { Location: redirect.destination }); return res.end(); }

  const extra = {};
  for (const rule of config.headers) if (rule.match.test(pathname)) for (const h of rule.headers) extra[h.key] = h.value;
  delete extra['Cache-Control'];   // the preview never caches

  const direct = fileFor(pathname);
  if (direct) return send(res, direct, extra);

  const rewrite = config.rewrites.find((r) => r.match.test(pathname));
  if (rewrite && /^https?:/.test(rewrite.destination)) return proxy(req, res);
  const target = rewrite && fileFor(rewrite.destination);
  if (target) return send(res, target, extra);

  if (rewrite && rewrite.destination.startsWith('/portal/')) {
    res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('The portal has not been built. Run `npm run build`, or use the Vite dev server: npm --prefix portal run dev');
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
}).listen(port, '127.0.0.1', () => {
  console.log(`MonkFlow preview: http://localhost:${port}   serving ${useDist ? 'dist/ (as built)' : 'the repo root (live files)'}   /api -> ${apiTarget.origin}`);
});
