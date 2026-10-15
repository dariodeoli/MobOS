import base from './nav-v2.frontend.config.js'
export default { ...base, testMatch: ['ruc498-identidad.frontend.spec.js'], webServer: { ...base.webServer, reuseExistingServer: false } }
