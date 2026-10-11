import { defineConfig } from '@playwright/test'

// Frontend demo only: intentionally no shared PG/backend global setup.
export default defineConfig({
  testDir: './frontend',
  testMatch: 'nav-v2.frontend.spec.js',
  workers: 1,
  retries: 0,
  timeout: 60000,
  outputDir: '/tmp/mobos-nav-v2-qa/results',
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:5291', timezoneId: 'America/Asuncion', headless: true },
})
