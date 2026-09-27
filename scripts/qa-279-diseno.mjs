// Capturas del diseño #279 (A3 aprobación OTP · A5 variante agotada): recorre
// los pasos de cada preview en claro/oscuro y desktop/móvil, mide desborde y
// contraste AA de las propias pantallas (mismo auditor de #241).
//
// Las rutas `/diseno-*` solo existen en DEV: hay que servir con `vite` (dev).
//
//   npx vite --port 5203 --strictPort &
//   node scripts/qa-279-diseno.mjs
//
// Evidencia: docs/qa/279-diseno/{a3,a5}/ (capturas + resultado.json).
/* global document */
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { auditarContraste } from '../e2e/helpers/contraste.js'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = (process.env.QA_BASE_URL || 'http://localhost:5203').replace(/\/$/, '')
const SALIDA = process.env.QA_OUT || join(RAIZ, 'docs/qa/279-diseno')

const PANTALLAS = [
  { id: 'a3', testid: 'a3-preview', ruta: '/diseno-aprobacion-otp', pasos: ['1 · Solicitud', '2 · Código', '3 · Constancia'], claves: ['2 · Código'] },
  { id: 'a5', testid: 'a5-preview', ruta: '/diseno-variante-agotada', pasos: ['1 · Proponer', '2 · Enviada', '3 · Decisión', '4 · Resultado'], claves: ['3 · Decisión'] },
]

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await ctx.newPage()
const esperar = (ms) => page.waitForTimeout(ms)

const resultados = []
for (const pantalla of PANTALLAS) {
  mkdirSync(join(SALIDA, pantalla.id), { recursive: true })
  for (const [tema, modo] of [['claro', 'light'], ['oscuro', 'dark']]) {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto(`${BASE}${pantalla.ruta}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.locator(`[data-testid="${pantalla.testid}"]`).waitFor({ state: 'visible', timeout: 20_000 })
    await page.evaluate((m) => { try { localStorage.setItem('mobos:theme', m) } catch { /* sin storage */ } }, modo)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.locator(`[data-testid="${pantalla.testid}"]`).waitFor({ state: 'visible', timeout: 20_000 })
    await esperar(700)

    for (const paso of pantalla.pasos) {
      await page.getByRole('button', { name: paso, exact: true }).click()
      await esperar(400)
      const med = await page.evaluate(({ testid }) => ({
        paso: document.querySelector(`[data-testid="${testid}"]`)?.getAttribute('data-paso') || '',
        desborde: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      }), { testid: pantalla.testid })
      const contraste = await auditarContraste(page, [`[data-testid="${pantalla.testid}"]`])
      const nombre = `${String(paso).replace(/[^\w]+/g, '-').toLowerCase()}-${tema}-desktop.jpg`
      await page.screenshot({ path: join(SALIDA, pantalla.id, nombre), type: 'jpeg', quality: 76 })
      resultados.push({ pantalla: pantalla.id, paso, vista: 'desktop', tema, ...med, textos: contraste.medidos, bajosAA: contraste.bajos.length, detalleAA: contraste.bajos.slice(0, 4) })
      console.log(`[279] ${pantalla.id} ${paso} ${tema} desktop · desborde=${med.desborde ? 'SÍ' : 'no'} · AA bajos=${contraste.bajos.length}/${contraste.medidos}`)
    }

    // Móvil: solo el paso clave de cada pantalla, en claro.
    if (tema !== 'claro') continue
    await page.setViewportSize({ width: 390, height: 844 })
    for (const paso of pantalla.claves) {
      await page.getByRole('button', { name: paso, exact: true }).click()
      await esperar(400)
      const med = await page.evaluate(() => ({
        desborde: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      }))
      await page.screenshot({ path: join(SALIDA, pantalla.id, `${String(paso).replace(/[^\w]+/g, '-').toLowerCase()}-claro-mobile.jpg`), type: 'jpeg', quality: 76, fullPage: false })
      resultados.push({ pantalla: pantalla.id, paso, vista: 'mobile', tema: 'claro', ...med })
      console.log(`[279] ${pantalla.id} ${paso} claro mobile · desborde=${med.desborde ? 'SÍ' : 'no'}`)
    }
  }
}

writeFileSync(join(SALIDA, 'resultado.json'), `${JSON.stringify({ base: BASE, fecha: new Date().toISOString(), resultados }, null, 2)}\n`)
await browser.close()
const bajos = resultados.filter((r) => r.bajosAA)
const desbordes = resultados.filter((r) => r.desborde)
console.log(`\n[279] ${BASE} · ${resultados.length} capturas · AA bajos: ${bajos.length ? bajos.map((b) => `${b.pantalla}/${b.paso}`).join(', ') : 'ninguno'} · desbordes: ${desbordes.length}`)
