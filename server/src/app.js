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
const portalRoutes = require('./routes/portal');

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
    if (req.url && (req.url.includes('/quickbooks/webhook') || req.url.includes('/billing/webhook') || req.url.includes('/linkedin/webhook') || req.url.includes('/outreach/webhook/resend'))) {
      req.rawBody = buf;
    }
  },
}));
if (env.nodeEnv !== 'test') app.use(morgan(env.isDev ? 'dev' : 'combined'));
app.use(rateLimiter.global);

// Health check
// Health check. Always answers 200 so the host does not restart the service
// over a database blip; `status` says whether everything is actually up.
// The portal's sign-in screen shows this to clients, so it must be honest.
app.get('/api/v1/health', async (req, res) => {
  let database = 'ok';
  try {
    await Promise.race([
      require('./config/database').query('SELECT 1'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000)),
    ]);
  } catch { database = 'down'; }
  res.json({ status: database === 'ok' ? 'ok' : 'degraded', checks: { database }, timestamp: new Date().toISOString() });
});

// Routes
// The pre-portal API serves the staff console at /admin and nothing else.
// Client workspaces use /api/v1/portal, so a client sign-in is refused here
// whatever an individual route forgets to check.
const staffOnly = [require('./middleware/auth').authenticate, require('./middleware/requireSuperadmin')];
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', staffOnly, userRoutes);
app.use('/api/v1/workflows', staffOnly, workflowRoutes);
app.use('/api/v1/webhooks', webhookRoutes);
app.use('/api/v1/agents', staffOnly, agentRoutes);
app.use('/api/v1/appointments', appointmentRoutes);
app.use('/api/v1/notifications', staffOnly, notificationRoutes);
app.use('/api/v1/logs', staffOnly, logRoutes);
app.use('/api/v1/settings', staffOnly, settingsRoutes);
app.use('/api/v1/api-keys', staffOnly, apiKeyRoutes);
app.use('/api/v1/team', staffOnly, teamRoutes);
app.use('/api/v1/contact', contactRoutes);
app.use('/api/v1/dashboard', staffOnly, dashboardRoutes);
app.use('/api/v1/projects', projectRoutes);
app.use('/api/v1/leadgen', leadgenRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/plans', staffOnly, planRoutes);
app.use('/api/v1/quickbooks', quickbooksRoutes);
app.use('/api/v1/billing', billingRoutes);
app.use('/api/v1/outreach', outreachRoutes);
app.use('/api/v1/stonkbot', stonkbotRoutes);
app.use('/api/v1/integrations', staffOnly, integrationRoutes);
app.use('/api/v1/client-errors', clientErrorRoutes);
app.use('/api/v1/linkedin', linkedinRoutes);
app.use('/api/v1/portal', portalRoutes);
app.use('/api/v1/ingest', require('./routes/ingest.routes'));

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: { message: 'Route not found' } });
});

// Global error handler
app.use(errorHandler);

module.exports = app;
