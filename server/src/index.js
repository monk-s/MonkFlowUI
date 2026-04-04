const env = require('./config/env');
const app = require('./app');
const { pool } = require('./config/database');
const fs = require('fs');
const path = require('path');
const logger = require('./utils/logger');

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
        logger.info(`Migration ${file} applied`);
        count++;
      } catch (err) {
        await client.query('ROLLBACK');
        logger.error(`Migration ${file} FAILED: %s`, err.message);
      }
    }
    if (count > 0) logger.info(`${count} new migration(s) applied.`);
  } catch (err) {
    logger.error('Migration check failed: %s', err.message);
  } finally {
    client.release();
  }
}

// Run migrations then start server
runMigrations().then(() => {
  const server = app.listen(env.port, () => {
    logger.info(`MonkFlow API running on port ${env.port} [${env.nodeEnv}]`);

    // Start lead generation cron
    try {
      const leadgenScheduler = require('./services/leadgen.scheduler');
      leadgenScheduler.start();
    } catch (err) {
      logger.error('Lead gen scheduler failed to start: %s', err.message);
    }

    // Start usage reset cron
    try {
      const usageScheduler = require('./services/usage.scheduler');
      usageScheduler.start();
    } catch (err) {
      logger.error('Usage scheduler failed to start: %s', err.message);
    }

    // Start billing cron
    try {
      const billingScheduler = require('./services/billing.scheduler');
      billingScheduler.start();
    } catch (err) {
      logger.error('Billing scheduler failed to start: %s', err.message);
    }

    // Start outreach follow-up cron
    try {
      const outreachScheduler = require('./services/outreach.scheduler');
      outreachScheduler.start();
    } catch (err) {
      logger.error('Outreach scheduler failed to start: %s', err.message);
    }
  });

  // Graceful shutdown
  const shutdown = async (signal) => {
    logger.info(`${signal} received. Shutting down gracefully...`);

    server.close(async () => {
      try {
        await pool.end();
        logger.info('Database pool closed');
      } catch (err) {
        logger.error({ err }, 'Error closing pool');
      }

      try {
        const scheduler = require('./services/workflow.scheduler');
        scheduler.stopAll();
        const leadgenScheduler = require('./services/leadgen.scheduler');
        leadgenScheduler.stop();
        const usageScheduler = require('./services/usage.scheduler');
        usageScheduler.stop();
        const billingScheduler = require('./services/billing.scheduler');
        billingScheduler.stop();
        const outreachScheduler = require('./services/outreach.scheduler');
        outreachScheduler.stop();
        logger.info('Cron jobs stopped');
      } catch { /* scheduler not loaded yet */ }

      process.exit(0);
    });

    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (err) => {
    logger.error({ err }, 'Unhandled Rejection');
  });
});
