import { defineConfig } from '@playwright/test'
const port = Number(process.env.MOBOS_QA_PORT || 5397)
export default defineConfig({
  testDir: './frontend', testMatch: 'images404.frontend.spec.js', workers: 1, retries: 0, timeout: 30000,
  outputDir: '/tmp/mobos-images404-results', reporter: 'list',
  use: { baseURL: `http://127.0.0.1:${port}`, headless: true, viewport: { width: 390, height: 844 }, screenshot: 'off', trace: 'off', video: 'off' },
  webServer: { command: `npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`, cwd: '..', url: `http://127.0.0.1:${port}`, reuseExistingServer: false, env: { VITE_API_URL: `http://127.0.0.1:${port}` }, timeout: 120000 },
})
