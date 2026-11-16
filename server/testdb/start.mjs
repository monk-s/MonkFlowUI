#!/usr/bin/env node
// Start a private Postgres on this machine, for the API tests and for local
// development. No Docker, no system install: the binary ships inside the
// embedded-postgres package.
//
//   node testdb/start.mjs [port] [dataDir] [persistent]
//
//   port        default 54329
//   dataDir     default testdb/.data  (ignored by git)
//   persistent  pass the word "persistent" to keep the data between runs
//
// Prints "READY <connection url>" on stdout once it accepts connections and
// then stays up until it receives SIGTERM or SIGINT.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';

const here = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.argv[2]) || 54329;
const dataDir = path.resolve(process.argv[3] || path.join(here, '.data'));
const persistent = process.argv[4] === 'persistent';

if (!persistent) fs.rmSync(dataDir, { recursive: true, force: true });

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'postgres',
  password: 'postgres',
  port,
  persistent,
  onLog: () => {},
  onError: (e) => { if (process.env.TESTDB_VERBOSE) console.error(String(e)); },
});

const fresh = !fs.existsSync(path.join(dataDir, 'PG_VERSION'));
if (fresh) await pg.initialise();
await pg.start();
if (fresh) await pg.createDatabase('monkflow');

console.log(`READY postgresql://postgres:postgres@127.0.0.1:${port}/monkflow`);

let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  try { await pg.stop(); } catch { /* already down */ }
  process.exit(0);
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
