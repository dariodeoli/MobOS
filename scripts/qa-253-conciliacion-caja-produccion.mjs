// Verificación en PRODUCCIÓN de Caja y Conciliación (#148 §17 · #144) sobre el
// demo público: turno abierto, medios y auditoría de efectivo, cobro marcado
// como verificado, lote conciliado con diferencia y capturas. Sin credenciales.
//
// Uso: node scripts/qa-253-conciliacion-caja-produccion.mjs
// Salida: docs/qa/finanzas-caja-conciliacion/produccion/*.png + resultados.json
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect } from '@playwright/test'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const WEB = (process.env.QA_BASE_URL || 'https://app.moboss.online').replace(/\/$/, '')
const SALIDA = process.env.QA_OUT || join(RAIZ, 'docs/qa/finanzas-caja-conciliacion/produccion')
mkdirSync(SALIDA, { recursive: true })

const resultados = []
const ver = async (nombre, fn) => {
  try {
    const detalle = await fn()
    resultados.push({ nombre, ok: true, detalle: detalle || '' })
    console.log(`OK    ${nombre}${detalle ? ` — ${detalle}` : ''}`)
  } catch (error) {
    resultados.push({ nombre, ok: false, detalle: String(error?.message || error).slice(0, 300) })
    console.log(`FALLO ${nombre} — ${String(error?.message || error).slice(0, 180)}`)
  }
}

const erroresConsola = []
const llamadasFinanzas = []
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'America/Asuncion' })
const page = await ctx.newPage()
page.on('console', (msg) => { if (msg.type() === 'error') erroresConsola.push(msg.text().slice(0, 180)) })
page.on('pageerror', (error) => erroresConsola.push(`pageerror: ${error.message.slice(0, 160)}`))
page.on('request', (peticion) => {
  if (/\/(api\/finance|api\/reports|api\/cash|api\/account|api\/orders)/.test(peticion.url())) llamadasFinanzas.push(peticion.url())
})

await ver('Demo: se entra como Dueño', async () => {
  await page.goto(`${WEB}/demo`)
  await page.getByRole('button', { name: /Entrar como Dueño/i }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 30000 })
  await page.getByRole('button', { name: 'Cerrar' }).click({ timeout: 5000 }).catch(() => {})
})

// ── Caja ────────────────────────────────────────────────────────────────
await ver('Caja: turno abierto con medios y auditoría de efectivo', async () => {
  await page.goto(`${WEB}/finanzas/caja`)
  await expect(page.locator('strong').filter({ hasText: 'Abierta' }).first()).toBeVisible({ timeout: 20000 })
  await expect(page.getByText('Sin apertura')).toHaveCount(0)
  await expect(page.getByText('Entradas por medio de pago')).toBeVisible({ timeout: 20000 })
  await expect(page.getByText('Auditoría de efectivo')).toBeVisible()
  await expect(page.getByText('Demo: cobros ficticios del rango')).toBeVisible()
  await expect(page.getByText('Falta sesión')).toHaveCount(0)
})
await ver('Caja: captura desktop', async () => {
  await page.screenshot({ path: join(SALIDA, 'caja-produccion-desktop.png'), fullPage: true })
})
await ver('Caja: un cobro de efectivo se marca como verificado', async () => {
  const fila = page.getByTestId('auditoria-fila').first()
  await fila.getByRole('combobox').selectOption('VERIFIED')
  await fila.getByRole('button', { name: 'Guardar' }).click()
  await expect(fila.getByText('Verificado', { exact: true }).first()).toBeVisible({ timeout: 15000 })
  await expect(fila.getByRole('button', { name: 'Guardar' })).toBeDisabled()
})
await ver('Caja: captura mobile', async () => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${WEB}/finanzas/caja`)
  await expect(page.locator('strong').filter({ hasText: 'Abierta' }).first()).toBeVisible({ timeout: 20000 })
  await page.screenshot({ path: join(SALIDA, 'caja-produccion-mobile.png'), fullPage: true })
  await page.setViewportSize({ width: 1440, height: 1000 })
})

// ── Conciliación ────────────────────────────────────────────────────────
await ver('Conciliación: resumen y filas por cuenta/procesadora', async () => {
  await page.goto(`${WEB}/finanzas/conciliacion`)
  await expect(page.getByRole('heading', { name: 'Conciliación y trazabilidad' })).toBeVisible({ timeout: 20000 })
  await expect(page.getByTestId('conciliacion-fila').first()).toBeVisible({ timeout: 20000 })
  await expect(page.getByText('Por conciliar').first()).toBeVisible()
  await expect(page.getByText('Falta sesión')).toHaveCount(0)
})
await ver('Conciliación: un lote se concilia y queda con diferencia', async () => {
  const fila = page.getByTestId('conciliacion-fila').filter({ hasText: 'Por conciliar' }).first()
  await fila.getByRole('checkbox').check()
  const boton = page.getByRole('button', { name: 'Conciliar lote' })
  await expect(boton).toBeEnabled({ timeout: 10000 }).catch(async () => {
    // Con diferencia, la nota es obligatoria: se completa y sigue.
    await page.getByPlaceholder(/la procesadora retuvo/).fill('Verificación en producción')
  })
  await expect(async () => {
    await boton.click()
    await expect(page.getByText(/Lote conciliado/)).toBeVisible({ timeout: 4000 })
  }).toPass({ timeout: 30_000 })
  await expect(page.getByTestId('conciliacion-lote').first()).toBeVisible()
})
await ver('Conciliación: captura desktop', async () => {
  await page.screenshot({ path: join(SALIDA, 'conciliacion-produccion-desktop.png'), fullPage: true })
})
await ver('Conciliación: captura mobile', async () => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${WEB}/finanzas/conciliacion`)
  await expect(page.getByRole('heading', { name: 'Conciliación y trazabilidad' })).toBeVisible({ timeout: 20000 })
  await page.screenshot({ path: join(SALIDA, 'conciliacion-produccion-mobile.png'), fullPage: true })
})

await ver('Demo: la caja y la conciliación no llaman al API ni ensucian la consola', async () => {
  expect(llamadasFinanzas, `llamadas de finanzas en la demo:\n${llamadasFinanzas.join('\n')}`).toEqual([])
  expect(erroresConsola, `errores de consola:\n${erroresConsola.join('\n')}`).toEqual([])
  return 'sin llamadas ni errores'
})

const fallos = resultados.filter((r) => !r.ok)
writeFileSync(join(SALIDA, 'resultados.json'), JSON.stringify({
  web: WEB, fecha: new Date().toISOString(),
  llamadasFinanzas, erroresConsola, resultados,
}, null, 2))
await browser.close()
console.log(`\n${resultados.length - fallos.length}/${resultados.length} verificaciones en ${WEB}`)
if (fallos.length) process.exit(1)
console.log('Caja y conciliación verificadas. Capturas en ' + SALIDA)
