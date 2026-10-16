import base from './nav-v2.frontend.config.js'
export default {...base,forbidOnly: Boolean(process.env.CI),testMatch:'pin-cambio484.frontend.spec.js',webServer:{...base.webServer,reuseExistingServer:false}}
