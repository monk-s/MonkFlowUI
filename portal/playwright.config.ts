import { defineConfig } from '@playwright/test';

// End-to-end tests for the portal, in the Chrome already installed on this
// machine (no browser download). Each run starts a local API with a freshly
// wiped database of EXAMPLE_DATA (server/scripts/dev-portal.js) and the Vite
// dev server, so tests can accept invitations and change roles freely.
//
//   npm --prefix portal run e2e
//
// Needs `npm --prefix server/testdb install` once.
const API_PORT = 8787;

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    channel: 'chrome',
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: `node ../server/scripts/dev-portal.js`,
      env: { PORT: String(API_PORT), DISABLE_RATE_LIMITS: '1' },
      url: `http://127.0.0.1:${API_PORT}/api/v1/health`,
      reuseExistingServer: false,
      timeout: 90_000,
    },
    {
      command: 'npx vite',
      env: { API_TARGET: `http://127.0.0.1:${API_PORT}` },
      url: 'http://localhost:5173/sign-in',
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
