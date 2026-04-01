require('dotenv').config();

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 8080,
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '15m',
  refreshTokenExpiresDays: parseInt(process.env.REFRESH_TOKEN_EXPIRES_DAYS, 10) || 30,
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  emailProvider: process.env.EMAIL_PROVIDER || '',
  resendApiKey: process.env.RESEND_API_KEY || '',
  emailFrom: process.env.EMAIL_FROM || 'noreply@monkflow.io',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  googleServiceAccountKey: process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '',
  googleCalendarId: process.env.GOOGLE_CALENDAR_ID || '',
  ownerUserId: process.env.OWNER_USER_ID || '',
  serpApiKey: process.env.SERPAPI_KEY || '',
  leadgenEnabled: process.env.LEADGEN_ENABLED === 'true',
  leadgenDailyLimit: parseInt(process.env.LEADGEN_DAILY_LIMIT, 10) || 20,
  leadgenFromEmail: process.env.LEADGEN_FROM_EMAIL || 'nathan@getmonkflow.com',
  outreachFromEmail: process.env.OUTREACH_FROM_EMAIL || 'Nathan Linder <nathan@getmonkflow.com>',
  qboClientId: process.env.QBO_CLIENT_ID || '',
  qboClientSecret: process.env.QBO_CLIENT_SECRET || '',
  qboRedirectUri: process.env.QBO_REDIRECT_URI || 'https://resourceful-abundance-production.up.railway.app/api/v1/quickbooks/callback',
  qboEnvironment: process.env.QBO_ENVIRONMENT || 'sandbox',
  isDev: (process.env.NODE_ENV || 'development') === 'development',
  isProd: process.env.NODE_ENV === 'production',
};

// Validate required vars in production
if (env.isProd) {
  const required = ['DATABASE_URL', 'JWT_SECRET'];
  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }
}

module.exports = env;
