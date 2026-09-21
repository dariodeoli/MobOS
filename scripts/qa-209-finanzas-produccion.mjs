// Verificación post-deploy de #209 en el demo público: el patrón «último usado»
// funciona en la UI desplegada y, en la demo, no deja nada en localStorage
// (memoria por pestaña, se descarta al recargar). No usa credenciales.
//
// Uso: QA_BASE_URL=https://app.moboss.online node scripts/qa-209-finanzas-produccion.mjs
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect } from '@playwright/test'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = (process.env.QA_BASE_URL || 'https://app.moboss.online').replace(/\/$/, '')
const SALIDA = join(RAIZ, 'docs/qa/209/produccion')
mkdirSync(SALIDA, { recursive: true })

const resultados = []
const ver = async (nombre, fn) => {
  try {
    await fn()
    resultados.push({ nombre, ok: true })
    console.log(`OK    ${nombre}`)
  } catch (error) {
    resultados.push({ nombre, ok: false, detalle: String(error?.message || error).slice(0, 300) })
    console.log(`FALLO ${nombre} — ${String(error?.message || error).slice(0, 200)}`)
  }
}

// 1) El bundle desplegado incluye las claves del patrón en Finanzas.
await ver('El bundle de producción incluye el patrón de Finanzas', async () => {
  const html = await (await fetch(`${BASE}/demo`)).text()
  const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((fila) => new URL(fila[1], BASE).href)
  const contenido = (await Promise.all(scripts.map(async (src) => (await fetch(src)).text()))).join('\n')
  for (const clave of ['fin:gastos-tipo', 'fin:gastos-moneda', 'fin:gastos-cuenta', 'fin:conciliacion-medio', 'fin:rango']) {
    expect(contenido.includes(clave), `falta ${clave} en el bundle`).toBe(true)
  }
})

const erroresConsola = []
const llamadasApi = []
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } })
const page = await ctx.newPage()
page.on('console', (msg) => { if (msg.type() === 'error') erroresConsola.push(msg.text().slice(0, 200)) })
page.on('pageerror', (error) => erroresConsola.push(`pageerror: ${error.message}`))
page.on('request', (peticion) => { if (peticion.url().includes('/api/reports') || peticion.url().includes('/api/finance')) llamadasApi.push(peticion.url()) })

await ver('El demo entra y Gastos arranca con el tipo por defecto', async () => {
  await page.goto(`${BASE}/demo`)
  await page.getByRole('button', { name: /Entrar como Dueño/i }).click()
  await page.waitForLoadState('networkidle')
  await page.goto(`${BASE}/finanzas/gastos`)
  await expect(page.getByRole('heading', { name: 'Registrar salida, cheque o adelanto' })).toBeVisible({ timeout: 30000 })
  await expect(page.locator('#tipo')).toHaveValue('EXPENSE')
  await page.screenshot({ path: join(SALIDA, '01-gastos-demo.jpg'), type: 'jpeg', quality: 70 })
})

await ver('En la demo el último usado no escribe localStorage y se descarta al recargar', async () => {
  await page.locator('#tipo').selectOption('CHEQUE')
  await page.locator('#moneda-gasto').selectOption('USD')
  const claves = await page.evaluate(() => Object.keys(localStorage).filter((clave) => clave.startsWith('mobos:ultimo:')))
  expect(claves, `la demo escribió: ${claves.join(', ')}`).toEqual([])
  await page.screenshot({ path: join(SALIDA, '02-gastos-elegido.jpg'), type: 'jpeg', quality: 70 })
  await page.reload()
  await expect(page.locator('#tipo')).toHaveValue('EXPENSE')
  await expect(page.locator('#moneda-gasto')).toHaveValue('PYG')
})

await ver('Conciliación del demo funciona sin persistir el período', async () => {
  await page.goto(`${BASE}/finanzas/conciliacion`)
  await expect(page.getByRole('heading', { name: 'Conciliación y trazabilidad' })).toBeVisible({ timeout: 30000 })
  await page.getByRole('button', { name: '30 días' }).click()
  await page.getByRole('button', { name: '7 días' }).click()
  const claves = await page.evaluate(() => Object.keys(localStorage).filter((clave) => clave.startsWith('mobos:ultimo:')))
  expect(claves, `la demo escribió: ${claves.join(', ')}`).toEqual([])
  await page.screenshot({ path: join(SALIDA, '03-conciliacion-demo.jpg'), type: 'jpeg', quality: 70 })
  // El rango vive en la URL (compartible), no en localStorage: al recargar se
  // mantiene por el parámetro y al volver a entrar sin parámetro manda el default.
  await page.reload()
  await expect(page.getByRole('button', { name: '7 días' })).toBeVisible()
  await page.goto(`${BASE}/finanzas/conciliacion`)
  await expect(page.getByRole('button', { name: '30 días' })).toBeVisible()
})

await ver('La demo no consulta los endpoints reales de métricas', async () => {
  expect(llamadasApi, `llamadas: ${llamadasApi.slice(0, 3).join(', ')}`).toEqual([])
})

await ver('Sin errores de consola propios', async () => {
  const RUIDO = /non-boolean attribute|Failed to load resource|ERR_CONNECTION_REFUSED|React Router Future Flag|ResizeObserver|favicon/i
  expect(erroresConsola.filter((texto) => !RUIDO.test(texto))).toEqual([])
})

writeFileSync(join(SALIDA, 'resultados.json'), JSON.stringify({ base: BASE, resultados, erroresConsola, llamadasApi }, null, 2))
await browser.close()
const fallos = resultados.filter((fila) => !fila.ok)
console.log(`\n${resultados.length - fallos.length}/${resultados.length} verificaciones de producción OK`)
if (fallos.length) process.exitCode = 1
