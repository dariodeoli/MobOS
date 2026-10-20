import base from './print513.frontend.config.js'
export default {
  ...base,
  testMatch: 'print550.frontend.spec.js',
  outputDir: '/tmp/mobos-print550-results',
  use: { ...base.use, baseURL: 'http://127.0.0.1:5387' },
  webServer: { ...base.webServer, command: 'npm run dev -- --host 127.0.0.1 --port 5387 --strictPort', url: 'http://127.0.0.1:5387', env: { VITE_API_URL: 'http://127.0.0.1:5387' } },
}
