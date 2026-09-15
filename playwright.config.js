import { defineConfig } from '@playwright/test'

// Phase 1 E2E QA harness. The backend serves the API on http://localhost:3001
// and the frontend on http://localhost:5173 (the only origin in the backend
// CORS allowlist for local development).
const CI = Boolean(process.env.CI)

export default defineConfig({
  testDir: './e2e',
  forbidOnly: !!CI,
  // Flaky retry locally, zero tolerance in CI.
  retries: CI ? 0 : 1,
  // Specs share seeded tenants and stock counters; keep workers low to avoid
  // checkout races. Public/auth specs are isolated anyway.
  workers: CI ? 1 : 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5173',
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
      testMatch: /pos-checkout\.spec\.js|permissions\.spec\.js|responsive\.spec\.js/,
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
      url: 'http://localhost:3001/api/health',
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command: 'bash e2e/bin/start-frontend.sh',
      url: 'http://localhost:5173',
      timeout: 120_000,
      reuseExistingServer: false,
    },
  ],
})
