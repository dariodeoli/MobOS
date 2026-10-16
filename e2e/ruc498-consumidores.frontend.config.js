import base from './nav-v2.frontend.config.js'
import { defineConfig } from '@playwright/test'

export default defineConfig({
  ...base,
  testMatch: ['ruc498-consumidores.frontend.spec.js'],
  webServer: { ...base.webServer, reuseExistingServer: false },
  use: { ...base.use, screenshot: 'off', trace: 'off', video: 'off' },
})
