import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './frontend',
  testMatch: 'plantillas507.frontend.spec.js',
  forbidOnly: !!process.env.CI,
  workers: 1,
  retries: 0,
  timeout: 60000,
  outputDir: '/tmp/mobos507-results',
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5357',
    headless: true,
    screenshot: 'off',
    trace: 'off',
    video: 'off',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5357 --strictPort',
    cwd: '..',
    url: 'http://127.0.0.1:5357',
    reuseExistingServer: false,
    env: { VITE_API_URL: 'http://127.0.0.1:5357' },
    timeout: 120000,
  },
})
