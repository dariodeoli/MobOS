import { defineConfig } from '@playwright/test'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const port = process.env.MOBOS_IMEI_HISTORY_PORT ? Number(process.env.MOBOS_IMEI_HISTORY_PORT) : await new Promise(resolve => {
  const server = createServer()
  server.listen(0, '127.0.0.1', () => { const value = server.address().port; server.close(() => resolve(value)) })
})
if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error('Invalid IMEI history test port')
process.env.MOBOS_IMEI_HISTORY_PORT = String(port)
const origin = `http://127.0.0.1:${port}`
export default defineConfig({
  testDir: './frontend', testMatch: /imei-history-filter\.frontend\.spec\.js/,
  workers: 1, retries: 0, reporter: 'list',
  use: { baseURL: origin, headless: true },
  webServer: {
    command: `VITE_API_URL=${origin} npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`,
    cwd: root, url: origin, reuseExistingServer: false,
  },
})
