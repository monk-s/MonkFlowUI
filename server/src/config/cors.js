const env = require('./env');

const corsOptions = {
  origin: env.isDev
    ? [env.corsOrigin, 'http://localhost:3000', 'http://localhost:8080']
    : env.corsOrigin.split(',').map(s => s.trim()),
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Webhook-Secret'],
  maxAge: 86400,
};

module.exports = corsOptions;
