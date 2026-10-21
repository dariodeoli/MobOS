import base from './nav-v2.frontend.config.js'
export default { ...base, testMatch: ['precios559.frontend.spec.js'], outputDir: process.env.MOBOS_QA_OUT || '/tmp/mobos-precios559', webServer: { ...base.webServer, reuseExistingServer: false } }
