const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const corsOptions = require('./config/cors');
const rateLimiter = require('./middleware/rateLimiter');
const errorHandler = require('./middleware/errorHandler');
const env = require('./config/env');

// Route imports
const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const workflowRoutes = require('./routes/workflow.routes');
const webhookRoutes = require('./routes/webhook.routes');
const agentRoutes = require('./routes/agent.routes');
const appointmentRoutes = require('./routes/appointment.routes');
const notificationRoutes = require('./routes/notification.routes');
const logRoutes = require('./routes/log.routes');
const settingsRoutes = require('./routes/settings.routes');
const apiKeyRoutes = require('./routes/apiKey.routes');
const teamRoutes = require('./routes/team.routes');
const contactRoutes = require('./routes/contact.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const projectRoutes = require('./routes/project.routes');
const leadgenRoutes = require('./routes/leadgen.routes');
const adminRoutes = require('./routes/admin.routes');
const planRoutes = require('./routes/plan.routes');
const quickbooksRoutes = require('./routes/quickbooks.routes');
const billingRoutes = require('./routes/billing.routes');
const outreachRoutes = require('./routes/outreach.routes');
const stonkbotRoutes = require('./routes/stonkbot.routes');
const integrationRoutes = require('./routes/integration.routes');
const clientErrorRoutes = require('./routes/clientError.routes');
const linkedinRoutes = require('./routes/linkedin.routes');

const app = express();

// Trust proxy (Railway runs behind a reverse proxy)
app.set('trust proxy', 1);

// Global middleware
app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json({
  limit: '50mb',
  verify: (req, _res, buf) => {
    // Preserve raw body for webhook signature verification
    if (req.url && (req.url.includes('/quickbooks/webhook') || req.url.includes('/billing/webhook') || req.url.includes('/linkedin/webhook'))) {
      req.rawBody = buf;
    }
  },
}));
app.use(morgan(env.isDev ? 'dev' : 'combined'));
app.use(rateLimiter.global);

// Health check
app.get('/api/v1/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Temporary: email deliverability diagnostics (remove after analysis)
app.get('/api/v1/_diag/email', async (req, res) => {
  try {
    const { query } = require('./config/database');
    const [openTiming, senderHealth, sampleOpens] = await Promise.all([
      query(`SELECT CASE
        WHEN EXTRACT(EPOCH FROM (ol.opened_at - oe.delivered_at)) < 10 THEN 'under_10s'
        WHEN EXTRACT(EPOCH FROM (ol.opened_at - oe.delivered_at)) < 60 THEN '10s_to_1m'
        WHEN EXTRACT(EPOCH FROM (ol.opened_at - oe.delivered_at)) < 3600 THEN '1m_to_1h'
        ELSE 'over_1h'
        END AS bucket, COUNT(*)::int AS count
        FROM outreach_leads ol
        JOIN outreach_emails oe ON oe.lead_id = ol.id AND oe.touch_number = 0
        WHERE ol.opened_at IS NOT NULL AND oe.delivered_at IS NOT NULL
        GROUP BY bucket ORDER BY bucket`),
      query(`SELECT sender_email, SUM(sent_count)::int AS sent, SUM(bounce_count)::int AS bounces,
        SUM(complaint_count)::int AS complaints,
        ROUND(SUM(bounce_count)::numeric / NULLIF(SUM(sent_count),0) * 100, 2) AS bounce_pct
        FROM sender_health GROUP BY sender_email ORDER BY sent DESC`),
      query(`SELECT ol.contact_email, oe.delivered_at, ol.opened_at,
        ROUND(EXTRACT(EPOCH FROM (ol.opened_at - oe.delivered_at)))::int AS secs_to_open
        FROM outreach_leads ol
        JOIN outreach_emails oe ON oe.lead_id = ol.id AND oe.touch_number = 0
        WHERE ol.opened_at IS NOT NULL AND oe.delivered_at IS NOT NULL
        ORDER BY secs_to_open ASC LIMIT 20`),
    ]);
    res.json({
      openTiming: openTiming.rows,
      senderHealth: senderHealth.rows,
      sampleOpens: sampleOpens.rows,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/workflows', workflowRoutes);
app.use('/api/v1/webhooks', webhookRoutes);
app.use('/api/v1/agents', agentRoutes);
app.use('/api/v1/appointments', appointmentRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/logs', logRoutes);
app.use('/api/v1/settings', settingsRoutes);
app.use('/api/v1/api-keys', apiKeyRoutes);
app.use('/api/v1/team', teamRoutes);
app.use('/api/v1/contact', contactRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/projects', projectRoutes);
app.use('/api/v1/leadgen', leadgenRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/plans', planRoutes);
app.use('/api/v1/quickbooks', quickbooksRoutes);
app.use('/api/v1/billing', billingRoutes);
app.use('/api/v1/outreach', outreachRoutes);
app.use('/api/v1/stonkbot', stonkbotRoutes);
app.use('/api/v1/integrations', integrationRoutes);
app.use('/api/v1/client-errors', clientErrorRoutes);
app.use('/api/v1/linkedin', linkedinRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: { message: 'Route not found' } });
});

// Global error handler
app.use(errorHandler);

module.exports = app;
