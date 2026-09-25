// Evidencia de #253 (grupo Comercial) — captura ANTES desde producción sobre
// /demo: el estado del grupo antes de agruparlo en su archivo propio.
//
// Uso: node scripts/qa-253-comercial-antes.mjs
// Salida: docs/qa/config-comercial/antes/*.png + resultados.json
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const WEB = (process.env.QA_BASE_URL || 'https://app.moboss.online').replace(/\/$/, '')
const SALIDA = process.env.QA_OUT || join(RAIZ, 'docs/qa/config-comercial/antes')
mkdirSync(SALIDA, { recursive: true })

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'America/Asuncion' })
const page = await ctx.newPage()
const pasos = []

await page.goto(`${WEB}/demo`)
await page.getByRole('button', { name: /Entrar como Dueño/i }).click()
await page.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 30000 })
await page.getByRole('button', { name: 'Cerrar' }).click({ timeout: 5000 }).catch(() => {})
pasos.push(`demo dueño OK en ${page.url()}`)

await page.goto(`${WEB}/configuracion/comercial`)
await page.waitForTimeout(1500)
pasos.push(`h1: ${await page.locator('h1').first().innerText().catch(() => '—')}`)
await page.screenshot({ path: join(SALIDA, 'comercial-antes-desktop.png'), fullPage: true })

await page.setViewportSize({ width: 390, height: 844 })
await page.reload()
await page.waitForTimeout(1200)
await page.screenshot({ path: join(SALIDA, 'comercial-antes-mobile.png'), fullPage: true })

writeFileSync(join(SALIDA, 'resultados.json'), JSON.stringify({ web: WEB, fecha: new Date().toISOString(), pasos }, null, 2))
await browser.close()
console.log(`Capturas ANTES en ${SALIDA}`)
console.log(pasos.join('\n'))
