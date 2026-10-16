import { defineConfig } from '@playwright/test'
const port=Number(process.env.MOBOS_QA_PORT||5318)
export default defineConfig({forbidOnly:Boolean(process.env.CI),testDir:'./frontend',testMatch:['pin-login504.frontend.spec.js','pin-tactil.frontend.spec.js','pin-segmentado.frontend.spec.js','login-codigos.frontend.spec.js'],workers:1,timeout:45000,use:{baseURL:`http://127.0.0.1:${port}`,headless:true},webServer:{command:`VITE_API_URL=http://127.0.0.1:1 npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`,url:`http://127.0.0.1:${port}/login`,reuseExistingServer:false}})
