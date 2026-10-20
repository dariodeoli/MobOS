import base from './nav-v2.frontend.config.js'
export default { ...base, testMatch: 'pin638.frontend.spec.js', webServer: { ...base.webServer, reuseExistingServer: false } }
