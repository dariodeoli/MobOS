import base from './nav-v2.frontend.config.js'

// Regresiones del pedido #498; el shard 1 de CI las ejecuta sin backend ni datos reales.
export default {
  ...base,
  testMatch: ['ruc-mobile.frontend.spec.js', 'ruc498-identidad.frontend.spec.js', 'ruc498-consumidores.frontend.spec.js', 'ruc498-config.frontend.spec.js'],
  forbidOnly: Boolean(process.env.CI),
  use: { ...base.use, screenshot: 'off', trace: 'off' },
  webServer: { ...base.webServer, reuseExistingServer: false },
}
