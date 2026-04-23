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
  emailFrom: process.env.EMAIL_FROM || 'noreply@getmonkflow.com',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  googleServiceAccountKey: process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '',
  googleCalendarId: process.env.GOOGLE_CALENDAR_ID || '',
  ownerUserId: process.env.OWNER_USER_ID || '',
  serpApiKey: process.env.SERPAPI_KEY || '',
  leadgenEnabled: process.env.LEADGEN_ENABLED === 'true',
  leadgenDailyLimit: parseInt(process.env.LEADGEN_DAILY_LIMIT, 10) || 20,
  outreachSendingDomain: process.env.OUTREACH_SENDING_DOMAIN || 'mail.getmonkflow.com',
  leadgenFromEmail: process.env.LEADGEN_FROM_EMAIL || `nathan@${process.env.OUTREACH_SENDING_DOMAIN || 'mail.getmonkflow.com'}`,
  outreachFromEmail: process.env.OUTREACH_FROM_EMAIL || `Nathan Linder <nathan@${process.env.OUTREACH_SENDING_DOMAIN || 'mail.getmonkflow.com'}>`,
  qboClientId: process.env.QBO_CLIENT_ID || '',
  qboClientSecret: process.env.QBO_CLIENT_SECRET || '',
  qboRedirectUri: process.env.QBO_REDIRECT_URI || 'https://resourceful-abundance-production.up.railway.app/api/v1/quickbooks/callback',
  qboEnvironment: process.env.QBO_ENVIRONMENT || 'sandbox',
  qboWebhookVerifierToken: process.env.QBO_WEBHOOK_VERIFIER_TOKEN || '',
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  resendWebhookSecret: process.env.RESEND_WEBHOOK_SECRET || '',
  apiUrl: process.env.API_URL || 'http://localhost:8080',
  inboundWebhookSecret: process.env.INBOUND_WEBHOOK_SECRET || '',
  // Daily Bible study digest — multiple recipients supported (comma-separated).
  // Each recipient gets their own send (not to/cc/bcc together) so nobody sees
  // anyone else's address. Override via BIBLE_STUDY_RECIPIENT env in Railway.
  // Default: Nathan + Prof. Alejandro Ezquerra (ACU, consented — the axe16a
  // prefix is just his ACU username, not a nickname). Never required.
  bibleStudyRecipients: (process.env.BIBLE_STUDY_RECIPIENT || 'nate@thelinders.com,axe16a@acu.edu')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean),
  // The #schedule hash triggers handleHashRoute() in app.js, which opens the
  // 3-step scheduling modal (calendar → time slot → details) directly. Not a
  // hash anchor to scroll — it IS the booking UX. Verified 2026-04-21 against
  // production. Override with BOOKING_URL in Railway env only if switching to
  // a different calendar provider (Cal.com, Calendly, etc.).
  bookingUrl: process.env.BOOKING_URL || 'https://monkflow.io/#schedule',
  pushoverUserKey: process.env.PUSHOVER_USER_KEY || '',
  pushoverAppToken: process.env.PUSHOVER_APP_TOKEN || '',
  unipileApiKey: process.env.UNIPILE_API_KEY || '',
  unipileDsn: process.env.UNIPILE_DSN || '',
  unipileAccountId: process.env.UNIPILE_ACCOUNT_ID || '',
  unipileWebhookSecret: process.env.UNIPILE_WEBHOOK_SECRET || '',
  linkedinOutreachEnabled: process.env.LINKEDIN_OUTREACH_ENABLED === 'true',
  linkedinDailyConnectLimit: parseInt(process.env.LINKEDIN_DAILY_CONNECT_LIMIT, 10) || 20,
  linkedinDailyDmLimit: parseInt(process.env.LINKEDIN_DAILY_DM_LIMIT, 10) || 15,
  linkedinDiscoveryMode: process.env.LINKEDIN_DISCOVERY_MODE || 'linkedin_boolean',
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
  // Refuse to boot in prod with the placeholder booking URL — otherwise the
  // PLACEHOLDER string leaks into real sent emails' P.S. lines. Set BOOKING_URL
  // in Railway to a real Cal.com / Calendly URL before the next send cohort.
  if (env.bookingUrl.includes('PLACEHOLDER')) {
    throw new Error(
      'BOOKING_URL env var is not set (or still contains PLACEHOLDER). ' +
      'Refusing to start in production — set BOOKING_URL in Railway to a real ' +
      'calendar URL (e.g. https://cal.com/your-handle/15min) before boot.'
    );
  }
  // Refuse to send outreach from the ROOT getmonkflow.com domain. The main
  // domain is reserved for transactional (billing, auth, bible study, owner
  // summaries). Cold outreach MUST go through the warmed mail.getmonkflow.com
  // subdomain to keep reputation segmented. If you see this error, either:
  //   - unset OUTREACH_FROM_EMAIL on Railway (defaults to nathan@mail.getmonkflow.com), OR
  //   - set OUTREACH_FROM_EMAIL="Nathan Linder <nathan@mail.getmonkflow.com>", OR
  //   - set OUTREACH_SENDING_DOMAIN=mail.getmonkflow.com (or another sending subdomain)
  // Historical bug: 370 cold follow-ups leaked onto the root domain between
  // 2026-04-06 and 2026-04-23 because OUTREACH_FROM_EMAIL was set to the root.
  const outreachAddrMatch = env.outreachFromEmail && env.outreachFromEmail.match(/<([^>]+)>|^([^\s<>]+@[^\s<>]+)$/);
  const outreachAddr = outreachAddrMatch ? (outreachAddrMatch[1] || outreachAddrMatch[2] || '').toLowerCase() : '';
  if (outreachAddr && /@getmonkflow\.com$/i.test(outreachAddr) && !/@mail\.getmonkflow\.com$/i.test(outreachAddr)) {
    throw new Error(
      `OUTREACH_FROM_EMAIL resolves to "${outreachAddr}" which is on the ROOT getmonkflow.com domain. ` +
      `Cold outreach must go through a warmed sending subdomain (e.g. mail.getmonkflow.com). ` +
      `Fix on Railway: unset OUTREACH_FROM_EMAIL (default is nathan@mail.getmonkflow.com), ` +
      `or explicitly set OUTREACH_SENDING_DOMAIN=mail.getmonkflow.com.`
    );
  }
}

// Helper exposed to services: detect whether the booking URL is a placeholder.
// Send paths use this to skip the P.S. line rather than emit a broken link.
env.bookingUrlIsPlaceholder = () => !env.bookingUrl || env.bookingUrl.includes('PLACEHOLDER');

module.exports = env;
