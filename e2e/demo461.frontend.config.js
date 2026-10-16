import base from './nav-v2.frontend.config.js'
export default { ...base, testMatch: 'demo461-flujos.frontend.spec.js', timeout: 45000, use: { ...base.use, actionTimeout: 7000, screenshot: 'off', trace: 'off', video: 'off' }, webServer: { ...base.webServer, reuseExistingServer: false } }
