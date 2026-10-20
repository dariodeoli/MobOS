import base from './nav-v2.frontend.config.js'
export default { ...base, grep: /499/, testMatch: ['focus499.frontend.spec.js', 'ruc498-identidad.frontend.spec.js'], outputDir: '/tmp/mobos-focus499/results', webServer: { ...base.webServer, reuseExistingServer: false } }
