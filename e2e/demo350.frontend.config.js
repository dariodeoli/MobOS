import base from './nav-v2.frontend.config.js'
export default { ...base, outputDir: '/tmp/mobos-demo350-results', forbidOnly: Boolean(process.env.CI), testMatch: 'demo350-perfiles.frontend.spec.js', timeout: 60000, use: { ...base.use, screenshot: 'off', trace: 'off', video: 'off' }, webServer: { ...base.webServer, reuseExistingServer: false } }
