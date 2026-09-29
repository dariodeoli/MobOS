// Capturas del pie institucional en páginas públicas (#292): claro/oscuro por
// página, con medición de si el pie está presente (texto institucional).
//
//   node scripts/qa-292-pie.mjs
//   QA_OUT=docs/qa/292-pie/despues node scripts/qa-292-pie.mjs
/* global document */
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = (process.env.QA_BASE_URL || 'http://localhost:5203').replace(/\/$/, '')
const SALIDA = process.env.QA_OUT || join(RAIZ, 'docs/qa/292-pie/despues')
mkdirSync(SALIDA, { recursive: true })

// Serial y SKU del seed e2e (páginas públicas sin token).
const PANTALLAS = [
  ['producto', '/producto/E2E-IPHONE15'],
  ['informe', '/u/356789102345678'],
  ['prueba', '/prueba'],
]

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await ctx.newPage()
const esperar = (ms) => page.waitForTimeout(ms)
const medidas = {}

for (const [tema, modo] of [['claro', 'light'], ['oscuro', 'dark']]) {
  await page.evaluate((m) => { try { localStorage.setItem('mobos:theme', m) } catch { /* sin storage */ } }, modo)

  // El pie también debe verse en móvil: se captura una vez en claro 390.
  for (const [nombre, ruta] of PANTALLAS) {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto(`${BASE}${ruta}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await esperar(1600)
    const med = await page.evaluate(() => {
      const textos = (document.body.innerText || '')
      const pie = [...document.querySelectorAll('footer')].find((f) => /Todos los derechos reservados/.test(f.textContent || ''))
      const credito = pie?.querySelector('a[href*="owncoding"]')
      return {
        pie: Boolean(pie),
        credito: Boolean(credito),
        version: (textos.match(/v\d+\.\d+\.\d+/) || [])[0] || '',
        desborde: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      }
    })
    medidas[`${nombre}-${tema}`] = med
    await page.screenshot({ path: join(SALIDA, `${nombre}-${tema}-desktop.jpg`), type: 'jpeg', quality: 74 })
    console.log(`[292] ${nombre} ${tema} · pie=${med.pie} · crédito=${med.credito} · ${med.version}`)
  }

  await page.setViewportSize({ width: 390, height: 844 })
  for (const [nombre, ruta] of PANTALLAS) {
    await page.goto(`${BASE}${ruta}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await esperar(1400)
    const med = await page.evaluate(() => ({
      pie: Boolean([...document.querySelectorAll('footer')].find((f) => /Todos los derechos reservados/.test(f.textContent || ''))),
      desborde: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    }))
    medidas[`${nombre}-${tema}-mobile`] = med
    await page.screenshot({ path: join(SALIDA, `${nombre}-${tema}-mobile.jpg`), type: 'jpeg', quality: 74 })
  }
}

writeFileSync(join(SALIDA, 'resultado.json'), `${JSON.stringify({ base: BASE, fecha: new Date().toISOString(), medidas }, null, 2)}\n`)
await browser.close()
const conPie = Object.values(medidas).filter((m) => m.pie).length
console.log(`\n[292] ${BASE} · ${Object.keys(medidas).length} capturas · con pie: ${conPie}`)
