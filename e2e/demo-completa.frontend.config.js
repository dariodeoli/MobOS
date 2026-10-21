import { defineConfig } from '@playwright/test'

// Demo completa: solo frontend (la demo vive en el navegador), sin backend ni base.
const port = Number(process.env.MOBOS_QA_PORT || process.env.MOBOS_E2E_WEB_PORT || 5300)
export default defineConfig({
  testDir: '.',
  testMatch: ['demo-completa.spec.js'],
  forbidOnly: Boolean(process.env.CI),
  workers: 1,
  retries: 0,
  outputDir: '/tmp/mobos-demo-completa-results',
  use: { baseURL: `http://127.0.0.1:${port}`, timezoneId: 'America/Asuncion', screenshot: 'off', trace: 'off', video: 'off' },
  webServer: {
    command: `VITE_API_URL=http://127.0.0.1:1 npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`,
    cwd: '..',
    url: `http://127.0.0.1:${port}/demo`,
    reuseExistingServer: true,
    timeout: 120000,
  },
})
