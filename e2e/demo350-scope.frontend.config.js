import {defineConfig} from '@playwright/test'
const port=5375
export default defineConfig({testDir:'./frontend',testMatch:'demo350-scope.frontend.spec.js',forbidOnly:true,workers:1,retries:0,timeout:45000,outputDir:'/tmp/mobos-demo350-scope/results',use:{baseURL:`http://127.0.0.1:${port}`,headless:true,screenshot:'off',trace:'off',video:'off'},webServer:{command:`npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`,cwd:'..',url:`http://127.0.0.1:${port}`,reuseExistingServer:false,env:{VITE_API_URL:`http://127.0.0.1:${port}`}}})
