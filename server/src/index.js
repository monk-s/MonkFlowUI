const env = require('./config/env');
const app = require('./app');
const { pool } = require('./config/database');
const fs = require('fs');
const path = require('path');

// Auto-run pending migrations on startup
async function runMigrations() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    const { rows: applied } = await client.query('SELECT name FROM _migrations ORDER BY id');
    const appliedSet = new Set(applied.map(r => r.name));

    const migrationsDir = path.join(__dirname, '../migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    let count = 0;
    for (const file of files) {
      if (appliedSet.has(file)) continue;
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`  ✔ Migration ${file} applied`);
        count++;
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`  ✖ Migration ${file} FAILED:`, err.message);
      }
    }
    if (count > 0) console.log(`${count} new migration(s) applied.`);
  } catch (err) {
    console.error('Migration check failed:', err.message);
  } finally {
    client.release();
  }
}

// Run migrations then start server
runMigrations().then(() => {
  const server = app.listen(env.port, () => {
    console.log(`MonkFlow API running on port ${env.port} [${env.nodeEnv}]`);
  });

  // Graceful shutdown
  const shutdown = async (signal) => {
    console.log(`\n${signal} received. Shutting down gracefully...`);

    server.close(async () => {
      try {
        await pool.end();
        console.log('Database pool closed');
      } catch (err) {
        console.error('Error closing pool:', err);
      }

      try {
        const scheduler = require('./services/workflow.scheduler');
        scheduler.stopAll();
        console.log('Cron jobs stopped');
      } catch { /* scheduler not loaded yet */ }

      process.exit(0);
    });

    setTimeout(() => {
      console.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err);
  });
});
