import {defineConfig} from '@playwright/test'
const port=5418
export default defineConfig({testDir:'./frontend',testMatch:'paridad-shell516.frontend.spec.js',forbidOnly:true,workers:1,retries:0,timeout:90000,outputDir:'/tmp/mobos-shell516/results',use:{baseURL:`http://127.0.0.1:${port}`,headless:true,screenshot:'off',trace:'off',video:'off'},webServer:{command:`npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`,cwd:'..',url:`http://127.0.0.1:${port}`,reuseExistingServer:false,env:{VITE_API_URL:`http://127.0.0.1:${port}`}}})
