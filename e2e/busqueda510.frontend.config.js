import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './frontend',
  testMatch: 'busqueda510.frontend.spec.js',
  forbidOnly: !!process.env.CI,
  workers: 1,
  retries: 0,
  timeout: 30000,
  outputDir: '/tmp/mobos510-results',
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5361',
    headless: true,
    screenshot: 'off',
    trace: 'off',
    video: 'off',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5361 --strictPort',
    cwd: '..',
    url: 'http://127.0.0.1:5361',
    reuseExistingServer: false,
    env: { VITE_API_URL: 'http://127.0.0.1:5361' },
    timeout: 120000,
  },
})
