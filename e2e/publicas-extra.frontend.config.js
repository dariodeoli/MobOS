import base from './nav-v2.frontend.config.js'
import { defineConfig } from '@playwright/test'
export default defineConfig({ ...base, forbidOnly: Boolean(process.env.CI), testMatch: ['publicas-extra.frontend.spec.js'] })
