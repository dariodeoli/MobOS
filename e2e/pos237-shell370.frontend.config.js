import base from './nav-v2.frontend.config.js'
export default {...base,testMatch:['shell-layout.frontend.spec.js'],grep:/QA-A shell/,outputDir:'/tmp/mobos-pos237-shell370/results',webServer:{...base.webServer,reuseExistingServer:false}}
