// Capturas del pipeline Trade-In del dueño (#256 · cierre #278).
//
// Recorre la demo pública en el perfil Dueño y deja las capturas del pipeline
// (barra compacta) para la comparación antes/después, con marcadores simples:
// cantidad de barras `barra-tradein` y de encabezados grandes duplicados.
//
// Uso:
//   QA_BASE_URL=https://app.moboss.online QA_ETIQUETA=antes \
//     QA_OUT=docs/qa/278-cierre/pos node scripts/qa-256-tradein-pipeline.mjs
//   QA_BASE_URL=http://localhost:5216 QA_ETIQUETA=despues \
//     QA_OUT=docs/qa/278-cierre/pos node scripts/qa-256-tradein-pipeline.mjs
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { cerrarGuiaDemo } from '../e2e/helpers/demo.js'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const BASE = (process.env.QA_BASE_URL || 'https://app.moboss.online').replace(/\/$/, '')
const SALIDA = process.env.QA_OUT || 'docs/qa/278-cierre/pos'
const ETIQUETA = (process.env.QA_ETIQUETA || 'rama').replace(/[^a-z0-9-]/gi, '')
mkdirSync(SALIDA, { recursive: true })
const esperar = (ms) => new Promise((r) => setTimeout(r, ms))

const navegador = await chromium.launch()
const resultados = { base: BASE, etiqueta: ETIQUETA, fecha: new Date().toISOString(), capturas: [] }

async function capturar(nombre, { viewport, oscuro = false }) {
  const contexto = await navegador.newContext({ viewport, deviceScaleFactor: viewport.width < 500 ? 2 : 1 })
  if (oscuro) await contexto.addInitScript(() => { try { localStorage.setItem('mobos:theme', 'dark') } catch { /* sin persistencia */ } })
  const page = await contexto.newPage()
  const errores = []
  page.on('pageerror', (error) => errores.push(String(error.message).slice(0, 160)))
  await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded' })
  await esperar(1400)
  await page.getByRole('button', { name: /Entrar como Dueño/ }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 30_000 })
  await esperar(2200)
  await cerrarGuiaDemo(page)
  await page.goto(`${BASE}/trade-in`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('barra-tradein').waitFor({ timeout: 25_000 }).catch(() => {})
  await esperar(1200)
  const archivo = `${nombre}-${ETIQUETA}.jpg`
  await page.screenshot({ path: join(SALIDA, archivo), type: 'jpeg', quality: 74 })
  const barraVisible = await page.locator('[data-testid="barra-tradein"]:visible').count()
  const encabezadosVisibles = await page.locator('main h2:visible').allInnerTexts().catch(() => [])
  resultados.capturas.push({
    archivo,
    tituloShell: await page.locator('h1').first().innerText().catch(() => ''),
    barraCompacta: barraVisible,
    encabezadoGrandeDuplicado: await page.locator('h2.text-2xl:visible').count(),
    encabezadosVisibles,
    erroresPagina: errores,
  })
  await contexto.close()
}

await capturar('trade-in-desktop-claro', { viewport: { width: 1440, height: 900 } })
await capturar('trade-in-desktop-oscuro', { viewport: { width: 1440, height: 900 }, oscuro: true })
await capturar('trade-in-mobile-claro', { viewport: { width: 390, height: 844 } })

writeFileSync(join(SALIDA, `resultados-trade-in-${ETIQUETA}.json`), JSON.stringify(resultados, null, 2))
console.log(JSON.stringify(resultados, null, 2))
await navegador.close()
