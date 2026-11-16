// Jest global setup: start a throwaway Postgres (testdb/start.mjs), apply
// every migration to it exactly as production does, and point the API at it.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const PORT = Number(process.env.TESTDB_PORT) || 54329;

module.exports = async () => {
  const root = path.join(__dirname, '..');
  if (!fs.existsSync(path.join(root, 'testdb', 'node_modules'))) {
    throw new Error('Run `npm --prefix testdb install` once before `npm test` (installs the throwaway Postgres).');
  }

  const child = spawn(process.execPath, [path.join(root, 'testdb', 'start.mjs'), String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'] });
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Test database did not start within 60s')), 60000);
    child.stdout.on('data', (buf) => {
      const m = String(buf).match(/READY (\S+)/);
      if (m) { clearTimeout(timer); resolve(m[1]); }
    });
    child.on('exit', (code) => { clearTimeout(timer); reject(new Error(`Test database exited early (code ${code})`)); });
  });
  global.__TESTDB_CHILD__ = child;

  const client = new Client({ connectionString: url });
  await client.connect();
  const dir = path.join(root, 'migrations');
  // Mirrors src/index.js: a failing migration is rolled back and skipped.
  // A few of the pre-portal files (047 and earlier) were written against the
  // live database and do not apply to an empty one; those are reported and
  // tolerated. The portal migrations (048 onward) must apply cleanly.
  const skipped = [];
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    try {
      await client.query('BEGIN');
      await client.query(fs.readFileSync(path.join(dir, file), 'utf8'));
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      if (parseInt(file, 10) >= 48) {
        await client.end();
        child.kill('SIGTERM');
        throw new Error(`Migration ${file} failed on a fresh database: ${err.message}`);
      }
      skipped.push(`${file}: ${err.message}`);
    }
  }
  if (skipped.length && process.env.TESTDB_VERBOSE) console.warn(`Pre-portal migrations skipped on a fresh database:\n  ${skipped.join('\n  ')}`);
  await client.end();

  // Inherited by the test workers.
  process.env.DATABASE_URL = url;
  process.env.JWT_SECRET = 'test-secret-not-used-anywhere-else';
  process.env.NODE_ENV = 'test';
  process.env.IDENTITY_PROVIDER = 'stub';
  process.env.DOCUMENT_KEY = '0'.repeat(63) + '1';   // test-only key
  process.env.FRONTEND_URL = 'http://localhost:4173';
  process.env.CORS_ORIGIN = 'http://localhost:4173';
  process.env.LOG_LEVEL = 'silent';
};
