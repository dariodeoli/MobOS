import { defineConfig } from '@playwright/test'
import base from './nav-v2.frontend.config.js'

// #433: regresión aislada de los alias, sin backend ni base compartida.
export default defineConfig({ ...base, testMatch: ['politicas-alias.frontend.spec.js'] })
