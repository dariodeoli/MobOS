import { defineConfig } from '@playwright/test'

// Aislable por agente/CI: MOBOS_E2E_API_PORT y MOBOS_E2E_WEB_PORT.
const API_PORT = process.env.MOBOS_E2E_API_PORT || '3001'
const WEB_PORT = process.env.MOBOS_E2E_WEB_PORT || '5175'

// Phase 1 E2E QA harness. The backend serves the API on http://localhost:3001
// and the frontend on http://localhost:5175 — the only local origin in the
// backend CORS allowlist (MOBOS_LOCAL_APP_ORIGIN in backend/lib/identity.ts)
// and the Vite default port from vite.config.js. MOBOS_APP_URL is set to the
// same origin so cookie-based auth passes the backend sameOrigin() check.
const CI = Boolean(process.env.CI)

export default defineConfig({
  testDir: './e2e',
  forbidOnly: !!CI,
  // Flaky retry locally, zero tolerance in CI.
  retries: CI ? 0 : 1,
  // Specs share seeded tenants and stock counters; keep workers low to avoid
  // checkout races. Public/auth specs are isolated anyway.
  workers: CI ? 1 : 1,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      // No storage state: UI login flows and anonymous API tracking.
      name: 'core',
      testMatch: /auth\.spec\.js|public-tracking\.spec\.js/,
    },
    {
      // Seeded seller session (PIN 2468) for POS and permissions coverage.
      name: 'seller',
      testMatch: /pos-checkout\.spec\.js|pos-campos\.spec\.js|permissions\.spec\.js|responsive\.spec\.js/,
      use: { storageState: 'e2e/.auth/seller.json' },
    },
    {
      // Seeded owner session (PIN 1234) for control views.
      name: 'admin',
      testMatch: /admin\.spec\.js/,
      use: { storageState: 'e2e/.auth/admin.json' },
    },
  ],
  globalSetup: './e2e/global-setup.mjs',
  globalTeardown: './e2e/global-teardown.mjs',
  webServer: [
    {
      command: 'bash e2e/bin/start-backend.sh',
      url: `http://localhost:${API_PORT}/api/health`,
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command: 'bash e2e/bin/start-frontend.sh',
      url: `http://localhost:${WEB_PORT}`,
      timeout: 120_000,
      reuseExistingServer: false,
    },
  ],
})
