import { defineConfig } from '@playwright/test'
const port=Number(process.env.MOBOS_QA_PORT||5314)
export default defineConfig({testDir:'./frontend',forbidOnly:Boolean(process.env.CI),testMatch:'snapshot502.frontend.spec.js',workers:1,timeout:60000,use:{baseURL:`http://127.0.0.1:${port}`,headless:true,screenshot:'off',trace:'off',video:'off'},webServer:{command:`VITE_API_URL=http://127.0.0.1:1 npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`,url:`http://127.0.0.1:${port}/login`,reuseExistingServer:false}})
