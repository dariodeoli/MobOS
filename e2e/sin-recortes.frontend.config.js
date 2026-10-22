import { defineConfig } from '@playwright/test'

// Demo frontend-only: sin backend ni base. Vite propio por puerto (MOBOS_QA_PORT).
const port = Number(process.env.MOBOS_QA_PORT || 5321)

export default defineConfig({
  testDir: '.',
  testMatch: ['sin-recortes.spec.js'],
  workers: 1,
  retries: 0,
  timeout: 900000,
  expect: { timeout: 8000 },
  outputDir: `${process.env.MOBOS_QA_OUT || '/tmp/mobos-sin-recortes'}/results`,
  reporter: [['list']],
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`,
    cwd: '..',
    url: `http://127.0.0.1:${port}`,
    env: { VITE_API_URL: `http://127.0.0.1:${port}` },
    reuseExistingServer: true,
    timeout: 120000,
  },
  use: { baseURL: `http://127.0.0.1:${port}`, timezoneId: 'America/Asuncion', headless: true },
})
