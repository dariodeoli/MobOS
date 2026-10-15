import base from './nav-v2.frontend.config.js'
import { defineConfig } from '@playwright/test'
export default defineConfig({ ...base, testMatch: ['publicas-extra.frontend.spec.js'] })
