import { defineConfig } from '@playwright/test'

// Frontend demo only: intentionally no shared PG/backend global setup.
export default defineConfig({
  testDir: './frontend',
  testMatch: [
    'nav-v2.frontend.spec.js',
    'pos-layout.frontend.spec.js',
    'shell-layout.frontend.spec.js',
    'blocks-preview.frontend.spec.js',
    'ventas-layout.frontend.spec.js',
    'finanzas-layout.frontend.spec.js',
    'stock-layout.frontend.spec.js',
  ],
  workers: 1,
  retries: 0,
  timeout: Number(process.env.MOBOS_QA_TIMEOUT || 60000),
  expect: { timeout: Number(process.env.MOBOS_QA_EXPECT_TIMEOUT || 5000) },
  outputDir: `${process.env.MOBOS_QA_OUT || '/tmp/mobos-nav-v2-qa'}/results`,
  reporter: [['list']],
  use: { baseURL: `http://127.0.0.1:${process.env.MOBOS_QA_PORT || 5291}`, timezoneId: 'America/Asuncion', headless: true },
})
