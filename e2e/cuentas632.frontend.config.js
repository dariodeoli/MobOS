import base from './nav-v2.frontend.config.js'
export default { ...base, testMatch: ['cuentas632.frontend.spec.js'], outputDir: '/tmp/mobos-cuentas632/results', webServer: { ...base.webServer, reuseExistingServer: false } }
