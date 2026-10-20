import base from './nav-v2.frontend.config.js'
export default {
  ...base,
  testMatch: 'demo350-clientes.frontend.spec.js',
  use: { ...base.use, actionTimeout: 5000 },
  outputDir: '/tmp/mobos-demo350-clientes-results',
  webServer: { ...base.webServer, reuseExistingServer: false },
}
