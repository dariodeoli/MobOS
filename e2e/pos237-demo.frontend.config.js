import base from './demo350-clientes.frontend.config.js'
// The combined run includes the cold-loading shell and POS baseline suites.
// Wait for UI state, without sleeps or retries, while Vite loads their modules.
export default {
  ...base,
  testMatch: ['demo350-clientes.frontend.spec.js', 'venta-rapida.frontend.spec.js', 'checkout-compacto.frontend.spec.js'],
  use: { ...base.use, actionTimeout: 15000 },
  expect: { timeout: 15000 },
  outputDir: '/tmp/mobos-pos237-demo/results',
}
