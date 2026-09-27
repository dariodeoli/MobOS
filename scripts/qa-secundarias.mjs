// Capturas antes/después de las páginas secundarias (#256, segunda unidad):
// Productos, Promociones, Cotizaciones, Plantillas, Delivery y Trade-In con la
// barra de módulo compacta (identidad + acciones) en claro/oscuro/móvil.
//
//   node scripts/qa-secundarias.mjs                       (producción: antes)
//   QA_BASE_URL=http://localhost:5203 QA_OUT=... node scripts/qa-secundarias.mjs
/* global document */
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = (process.env.QA_BASE_URL || 'https://app.moboss.online').replace(/\/$/, '')
const SALIDA = process.env.QA_OUT || join(RAIZ, 'docs/qa/paginas-secundarias/produccion')
mkdirSync(SALIDA, { recursive: true })

const PANTALLAS = [
  ['productos', '/productos', 'barra-productos', 'Productos'],
  ['promociones', '/promociones', 'barra-promociones', 'Promociones'],
  ['cotizaciones', '/cotizaciones', 'barra-cotizaciones', 'Cotizaciones'],
  ['plantillas', '/plantillas', 'barra-plantillas', 'Plantillas'],
  ['delivery', '/delivery', 'barra-delivery', 'Delivery'],
  ['trade-in', '/trade-in', 'barra-tradein', 'Cotizar equipo'],
]

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await ctx.newPage()
const esperar = (ms) => page.waitForTimeout(ms)

await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
await esperar(1200)
await page.getByRole('button', { name: /Entrar como Dueño/ }).first().click()
await page.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 60_000 })
await esperar(1200)
const guia = page.getByRole('dialog', { name: 'Cómo funciona la demo' })
if (await guia.waitFor({ state: 'visible', timeout: 4000 }).then(() => true).catch(() => false)) {
  await guia.getByRole('button', { name: 'Cerrar' }).click()
}
const version = ((await page.locator('body').innerText()).match(/v(\d+\.\d+\.\d+)/) || [])[1] || ''

const medidas = {}
for (const [tema, modo] of [['claro', 'light'], ['oscuro', 'dark']]) {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.evaluate((m) => { try { localStorage.setItem('mobos:theme', m) } catch { /* sin storage */ } }, modo)
  for (const [nombre, ruta, testId, titulo] of PANTALLAS) {
    await page.goto(`${BASE}${ruta}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.locator('[data-testid="shell"]').first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
    await page.waitForTimeout(900)
    if (tema === 'claro') {
      medidas[nombre] = await page.evaluate(({ testId, titulo }) => ({
        barra: (() => { const el = document.querySelector(`[data-testid="${testId}"]`); return Boolean(el && el.offsetParent !== null) })(),
        tituloVisible: [...document.querySelectorAll('h2')].some((h) => (h.textContent || '').trim() === titulo && h.offsetParent !== null),
      }), { testId, titulo })
    }
    await page.screenshot({ path: join(SALIDA, `${nombre}-${tema}-desktop.jpg`), type: 'jpeg', quality: 76 })
  }
}

await page.setViewportSize({ width: 390, height: 844 })
await page.evaluate(() => { try { localStorage.setItem('mobos:theme', 'light') } catch { /* sin storage */ } })
for (const [nombre, ruta] of PANTALLAS) {
  await page.goto(`${BASE}${ruta}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.locator('[data-testid="shell"]').first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
  await page.waitForTimeout(900)
  await page.screenshot({ path: join(SALIDA, `${nombre}-claro-mobile.jpg`), type: 'jpeg', quality: 76 })
}

writeFileSync(join(SALIDA, 'resultado.json'), `${JSON.stringify({ base: BASE, version, fecha: new Date().toISOString(), medidas }, null, 2)}\n`)
await browser.close()
console.log(`[secundarias] ${BASE} · v${version || '?'} · ${Object.values(medidas).filter((m) => m.barra).length}/${PANTALLAS.length} con barra`)
