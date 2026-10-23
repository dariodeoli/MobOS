import base from './nav-v2.frontend.config.js'

// Detalle del pedido estilo Shopify (demo frontend-only, sin backend). Puerto propio (MOBOS_QA_PORT).
export default { ...base, testMatch: ['pedido-shopify.frontend.spec.js', 'zz-antes.frontend.spec.js'], forbidOnly: Boolean(process.env.CI), timeout: 60000, use: { ...base.use, actionTimeout: 8000 }, webServer: { ...base.webServer, reuseExistingServer: false } }
