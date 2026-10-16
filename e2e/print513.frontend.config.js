import { defineConfig } from '@playwright/test'
export default defineConfig({
  forbidOnly: Boolean(process.env.CI),
  testDir: './frontend',
  testMatch: 'print513.frontend.spec.js',
  workers: 1,
  retries: 0,
  timeout: 60000,
  outputDir: '/tmp/mobos-print513-results',
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5382',
    headless: true,
    screenshot: 'off',
    trace: 'off',
    video: 'off',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5382 --strictPort',
    cwd: '..',
    url: 'http://127.0.0.1:5382',
    reuseExistingServer: false,
    env: {
      VITE_API_URL: 'http://127.0.0.1:5382',
      VITE_PUBLIC_TRACKING_URL: 'https://clientes.example.invalid',
    },
    timeout: 120000,
  },
})
