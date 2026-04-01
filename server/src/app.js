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

const app = express();

// Trust proxy (Railway runs behind a reverse proxy)
app.set('trust proxy', 1);

// Global middleware
app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(morgan(env.isDev ? 'dev' : 'combined'));
app.use(rateLimiter.global);

// Health check
app.get('/api/v1/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
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

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: { message: 'Route not found' } });
});

// Global error handler
app.use(errorHandler);

module.exports = app;
