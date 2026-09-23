// Referencia visual del antes/después de #249 en mobile (390 px).
//
//   node scripts/qa-249-responsive-prod.mjs
//
// Corre contra producción (default) o la base que se le pase (QA_BASE_URL): en
// producción queda la captura del estado sin los fixes (antes) y contra el
// harness conviene usar el e2e `qa-249-inventario-touch.spec.js`.
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = (process.env.QA_BASE_URL || 'https://app.moboss.online').replace(/\/$/, '')
const SALIDA = process.env.QA_OUT || join(RAIZ, 'docs/qa/249-inventario-responsive/prod')
mkdirSync(SALIDA, { recursive: true })

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: false })
const page = await ctx.newPage()
const esperar = (ms) => page.waitForTimeout(ms)

await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await esperar(1500)
await page.getByRole('button', { name: /Entrar como Dueño/ }).first().click()
await page.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 60000 })
await esperar(1500)
const guia = page.getByRole('dialog', { name: 'Cómo funciona la demo' })
if (await guia.waitFor({ state: 'visible', timeout: 4000 }).then(() => true).catch(() => false)) {
  await guia.getByRole('button', { name: 'Cerrar' }).click()
}
const version = ((await page.locator('body').innerText()).match(/v(\d+\.\d+\.\d+)/) || [])[1] || ''

await page.goto(`${BASE}/inventario/unidades`, { waitUntil: 'domcontentloaded' })
const fila = page.getByTestId('inventario-fila').first()
await fila.waitFor({ state: 'visible', timeout: 20000 })
await esperar(1000)
await page.screenshot({ path: join(SALIDA, '01-mobile-lista.jpg'), type: 'jpeg', quality: 72 })

// Medición del target real (para el reporte).
const medir = async (locator) => {
  const caja = await locator.boundingBox().catch(() => null)
  return caja ? { ancho: Math.round(caja.width), alto: Math.round(caja.height) } : null
}
const medidas = {
  casilla: await medir(fila.locator('label').first()) || await medir(fila.locator('input[type=checkbox]').first()),
  lapizCosto: await medir(fila.getByLabel(/^Editar el costo de/)),
  verificar: await medir(fila.getByLabel('✓ Verificar')),
  menuAcciones: await medir(fila.getByLabel(/^Acciones de/)),
  solapa: await medir(page.getByRole('button', { name: /^Inventario \(/ })),
}

// Ficha con checklist (Enter sobre la fila: en 390 la tabla scrollea horizontal).
await fila.press('Enter')
const ficha = page.getByRole('dialog')
const checklist = ficha.getByTestId('unidad-phonecheck')
await checklist.scrollIntoViewIfNeeded()
await esperar(800)
await page.screenshot({ path: join(SALIDA, '02-mobile-ficha-checklist.jpg'), type: 'jpeg', quality: 72 })
medidas.estadoChecklist = await medir(checklist.getByRole('button', { name: 'Bien' }).first())

await browser.close()
writeFileSync(join(SALIDA, 'medidas.json'), `${JSON.stringify({ base: BASE, version, fecha: new Date().toISOString(), medidas }, null, 2)}\n`)
console.log(JSON.stringify({ base: BASE, version, medidas }, null, 2))
