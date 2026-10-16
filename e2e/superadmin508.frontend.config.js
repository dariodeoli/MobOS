import { defineConfig } from '@playwright/test'
const port = 5372
export default defineConfig({
  testDir: './frontend', testMatch: 'superadmin508.frontend.spec.js',
  forbidOnly: true, workers: 1, retries: 0, timeout: 60000,
  outputDir: '/tmp/mobos-superadmin508/results', reporter: 'list',
  use: { baseURL: `http://127.0.0.1:${port}`, headless: true, timezoneId: 'America/Asuncion' },
  webServer: { command: `npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`, cwd: '..', url: `http://127.0.0.1:${port}`, reuseExistingServer: false, timeout: 120000, env: { VITE_API_URL: `http://127.0.0.1:${port}` } },
})
