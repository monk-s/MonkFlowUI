#!/usr/bin/env node
// Guards against the bug class logged in AUDIT_LOG.md (2026-09-21): every
// front-end script shares one global scope, so two top-level
// `function name()` declarations with the same name silently collide and
// the last one wins. A syntax check cannot see this.
//
//   node scripts/check-duplicate-functions.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = ['marketing/content.js', 'marketing/pages.js', 'marketing/site.js', 'app.js'];
const seen = new Map();
let dupes = 0;
for (const file of files) {
  fs.readFileSync(path.join(root, file), 'utf8').split('\n').forEach((line, i) => {
    const m = /^(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(/.exec(line);
    if (!m) return;
    const where = `${file}:${i + 1}`;
    if (seen.has(m[1])) { dupes++; console.error(`duplicate top-level function ${m[1]}: ${seen.get(m[1])} and ${where}`); }
    else seen.set(m[1], where);
  });
}
if (dupes) process.exit(1);
console.log(`${seen.size} top-level functions, no duplicates`);
