const env = require('./config/env');
const app = require('./app');
const { pool } = require('./config/database');

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

    // Stop cron jobs if loaded
    try {
      const scheduler = require('./services/workflow.scheduler');
      scheduler.stopAll();
      console.log('Cron jobs stopped');
    } catch { /* scheduler not loaded yet */ }

    process.exit(0);
  });

  // Force exit after 10s
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
