import base from './nav-v2.frontend.config.js'
// Solo frontend local; no globalSetup, backend ni DB. Incluye la spec de CI general.
export default {
  ...base, testDir: '.',
  testMatch: ['**/ruc-demo.spec.js', '**/ruc-mobile.frontend.spec.js', '**/ruc498-identidad.frontend.spec.js', '**/ruc498-config.frontend.spec.js', '**/ruc498-consumidores.frontend.spec.js'],
  webServer: { ...base.webServer, reuseExistingServer: false },
  use: { ...base.use, screenshot: 'off', trace: 'off', video: 'off' },
}
