import { defineConfig } from '@playwright/test'
// Servidores HTTP efímeros del spec, sin Vite/backend/DB ni rutas reales.
export default defineConfig({
  testDir: './frontend', testMatch: 'sw-isolation.frontend.spec.js',
  workers: 1, retries: 0, timeout: 30000, expect: { timeout: 5000 },
  outputDir: '/tmp/mobos-sw501-qa', reporter: 'list',
  use: { browserName: 'chromium', headless: true, serviceWorkers: 'allow', screenshot: 'off', trace: 'off', video: 'off' },
})
