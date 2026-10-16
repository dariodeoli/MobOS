import base from './nav-v2.frontend.config.js'
export default { ...base, testMatch: 'printing402.frontend.spec.js', forbidOnly: Boolean(process.env.CI),
  webServer: { ...base.webServer, reuseExistingServer: false },
  use: { ...base.use, screenshot: 'off', trace: 'off', video: 'off' } }
