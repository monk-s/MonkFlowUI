import { defineConfig } from '@playwright/test';

// End-to-end tests of the site AS VERCEL WILL SERVE IT: the real build
// (scripts/build-site.mjs -> dist/) behind scripts/dev-server.mjs --dist,
// which applies vercel.json's redirects, rewrites and headers and passes
// /api to a local API with EXAMPLE_DATA (server/scripts/dev-portal.js).
//
// This is where the hand-over between the three parts is checked: the public
// site, the portal (/sign-in, /dashboard) and the staff console (/admin).
//
//   npm --prefix portal run e2e:site
//
// Screen-level portal tests are in tests/ (playwright.config.ts).
const API_PORT = 8788;
const SITE_PORT = 4273;
const SITE = `http://localhost:${SITE_PORT}`;

export default defineConfig({
  testDir: './tests-site',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  reporter: [['list']],
  use: {
    baseURL: SITE,
    channel: 'chrome',
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'node ../server/scripts/dev-portal.js',
      // Without this Playwright kills the API outright and its Postgres leaks a shared-memory segment; macOS allows 32.
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
      env: { PORT: String(API_PORT), DEV_DB_PORT: '54332', FRONTEND_URL: SITE, DISABLE_RATE_LIMITS: '1' },
      url: `http://127.0.0.1:${API_PORT}/api/v1/health`,
      reuseExistingServer: false,
      timeout: 90_000,
    },
    {
      command: `node ../scripts/build-site.mjs && node ../scripts/dev-server.mjs ${SITE_PORT} --dist`,
      env: { API_TARGET: `http://127.0.0.1:${API_PORT}` },
      url: `${SITE}/sign-in`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
