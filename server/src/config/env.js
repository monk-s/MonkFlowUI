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
  leadgenPerSenderLimit: parseInt(process.env.LEADGEN_PER_SENDER_LIMIT, 10) || 30,
  // CAN-SPAM 15 U.S.C. § 7702(a)(5) requires a physical postal address in the
  // footer of every commercial email. Set COMPANY_ADDRESS in Railway. Empty
  // string disables the footer line — avoids rendering an awkward "MonkFlow"
  // with no address. Set COMPANY_NAME if it differs from MonkFlow.
  companyName: process.env.COMPANY_NAME || 'MonkFlow',
  companyAddress: process.env.COMPANY_ADDRESS || '',
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
}

// Outreach sender domain guard — auto-rewrite root → mail. subdomain.
//
// The root getmonkflow.com domain is reserved for transactional traffic
// (billing, auth, bible study, owner summaries). Cold outreach must go
// through the warmed mail.getmonkflow.com subdomain to keep reputation
// segmented. Historical bug: 370 cold follow-ups leaked onto the root
// domain between 2026-04-06 and 2026-04-23 because OUTREACH_FROM_EMAIL
// on Railway was set to the root.
//
// We auto-rewrite rather than throw so a misconfigured Railway env var
// can't take the whole API down. The rewrite logs loudly so it's visible
// in Railway logs until Nathan fixes OUTREACH_FROM_EMAIL / OUTREACH_SENDING_DOMAIN.
(() => {
  const addrMatch = env.outreachFromEmail && env.outreachFromEmail.match(/<([^>]+)>|^([^\s<>]+@[^\s<>]+)$/);
  const addr = addrMatch ? (addrMatch[1] || addrMatch[2] || '').toLowerCase() : '';
  if (!addr) return;
  const isRootOnly = /@getmonkflow\.com$/i.test(addr) && !/@mail\.getmonkflow\.com$/i.test(addr);
  if (!isRootOnly) return;
  const localPart = addr.split('@')[0];
  const fixedAddr = `${localPart}@mail.getmonkflow.com`;
  // Preserve "Display Name <...>" wrapping if the original had it
  const nameMatch = env.outreachFromEmail.match(/^([^<]+?)\s*<[^>]+>$/);
  const rewritten = nameMatch ? `${nameMatch[1].trim()} <${fixedAddr}>` : fixedAddr;
  console.warn('━'.repeat(72));
  console.warn(`⚠️  OUTREACH SENDER DOMAIN AUTO-REWRITTEN`);
  console.warn(`    OUTREACH_FROM_EMAIL resolved to "${addr}" (root domain — transactional only).`);
  console.warn(`    Auto-rewriting to "${fixedAddr}" for this process.`);
  console.warn(`    FIX ON RAILWAY: unset OUTREACH_FROM_EMAIL (default is correct),`);
  console.warn(`    or set OUTREACH_FROM_EMAIL="Nathan Linder <nathan@mail.getmonkflow.com>".`);
  console.warn('━'.repeat(72));
  env.outreachFromEmail = rewritten;
  // Also fix leadgenFromEmail if it was pulling from the same root address
  if (env.leadgenFromEmail && /@getmonkflow\.com$/i.test(env.leadgenFromEmail) && !/@mail\.getmonkflow\.com$/i.test(env.leadgenFromEmail)) {
    const lgLocal = env.leadgenFromEmail.split('@')[0];
    env.leadgenFromEmail = `${lgLocal}@mail.getmonkflow.com`;
  }
  // And outreachSendingDomain so SENDERS array in leadgen.service.js uses the subdomain
  if (env.outreachSendingDomain && /^getmonkflow\.com$/i.test(env.outreachSendingDomain)) {
    env.outreachSendingDomain = 'mail.getmonkflow.com';
  }
})();

// Helper exposed to services: detect whether the booking URL is a placeholder.
// Send paths use this to skip the P.S. line rather than emit a broken link.
env.bookingUrlIsPlaceholder = () => !env.bookingUrl || env.bookingUrl.includes('PLACEHOLDER');

module.exports = env;
