// Verificación en PRODUCCIÓN de Finanzas sobre el demo público (#148 §17/§18/§19
// · #144 · #171): caja (turno, medios, auditoría y la diferencia que no
// anticipa números), conciliación (resumen, lote con diferencia y trazabilidad)
// y márgenes con costo real (seguro de ventas, cadena Ingresos → Costo real →
// Resultado, honestidad de Reportes en la demo y Ganadores ordenados por
// ganancia). Sin credenciales.
//
// Uso: node scripts/qa-253-finanzas-produccion.mjs
// Salida: docs/qa/finanzas-produccion/produccion/*.png + resultados.json
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect } from '@playwright/test'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const WEB = (process.env.QA_BASE_URL || 'https://app.moboss.online').replace(/\/$/, '')
const SALIDA = process.env.QA_OUT || join(RAIZ, 'docs/qa/finanzas-produccion/produccion')
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

const numero = (texto) => Number(String(texto || '').replace(/\./g, '').replace(',', '.'))

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
  const guia = page.getByRole('dialog', { name: 'Cómo funciona la demo' })
  if (await guia.waitFor({ state: 'visible', timeout: 4000 }).then(() => true).catch(() => false)) {
    await guia.getByRole('button', { name: 'Cerrar' }).click()
  }
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
await ver('Caja: la diferencia no anticipa un número sin arqueo', async () => {
  // El hallazgo corregido: con la caja abierta y sin conteo, la tarjeta y la
  // barra del arqueo muestran — (se calcula al cierre).
  await expect(page.getByTestId('caja-diferencia')).toHaveText('—')
  await expect(page.getByText(/Contado\s*—/)).toBeVisible()
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
  await page.setViewportSize({ width: 1440, height: 1000 })
})

// ── Márgenes con costo real ─────────────────────────────────────────────
await ver('Márgenes: el seguro de ventas se configura en Comercial', async () => {
  await page.goto(`${WEB}/configuracion/comercial`)
  await expect(page.locator('#seguro-toggle')).toBeVisible({ timeout: 20000 })
  if (!(await page.locator('#seguro-toggle').isChecked())) await page.locator('#seguro-toggle').check({ force: true })
  await page.locator('#seguro-pct').fill('25')
  await page.getByRole('button', { name: 'Guardar seguro' }).click()
  await expect(page.getByTestId('seguro-estado')).toContainText('Guardado', { timeout: 15000 })
  return '25% sobre el costo'
})
await ver('Márgenes: Ganancias usa el costo real (costo + seguro) y cuadra', async () => {
  // Navegación dentro de la app: la demo guarda el seguro en memoria de la pestaña.
  await page.locator('aside nav button[aria-label="Análisis"]').click()
  await page.getByRole('tab', { name: 'Ganancias' }).click()
  await expect(page.getByRole('heading', { name: 'Cómo se calcula' })).toBeVisible({ timeout: 20000 })
  await expect(page.getByText(/Incluye seguro 25%/).first()).toBeVisible({ timeout: 15000 })
  const texto = await page.locator('main').innerText()
  const ingresos = numero((texto.match(/Ingresos por ventas[\s\S]{0,40}?Gs ([\d.]+)/) || [])[1])
  const costo = numero((texto.match(/Costo de mercadería vendida[\s\S]{0,40}?Gs ([\d.]+)/) || [])[1])
  const gastos = numero((texto.match(/Gastos[\s\S]{0,30}?Gs ([\d.]+)/) || [])[1]) || 0
  const ads = numero((texto.match(/Meta Ads[\s\S]{0,30}?Gs ([\d.]+)/) || [])[1]) || 0
  const resultado = numero((texto.match(/Resultado[\s\S]{0,40}?Gs ([\d.]+)/) || [])[1])
  expect(ingresos, 'Ingresos por ventas visible').toBeGreaterThan(0)
  expect(costo, 'Costo de mercadería vendida visible').toBeGreaterThan(0)
  expect(resultado).toBe(ingresos - costo - gastos - ads)
  await page.screenshot({ path: join(SALIDA, 'ganancias-produccion-desktop.png'), fullPage: true })
  return `Ingresos ${ingresos} − Costo ${costo} = Resultado ${resultado}`
})
await ver('Márgenes: Reportes no inventa cifras en la demo', async () => {
  await page.getByRole('tab', { name: 'Reportes' }).click()
  await expect(page.getByText('Reportes sobre datos reales')).toBeVisible({ timeout: 15000 })
  await expect(page.getByText(/preferimos no inventarlas/)).toBeVisible()
  await page.screenshot({ path: join(SALIDA, 'reportes-produccion-desktop.png'), fullPage: true })
})
await ver('Márgenes: Ganadores ordenado por ganancia real y con margen', async () => {
  await page.getByRole('tab', { name: 'Ganadores' }).click()
  await expect(page.getByRole('heading', { name: 'Productos ganadores' })).toBeVisible({ timeout: 20000 })
  await expect(page.getByText('Ordenado por ganancia del período')).toBeVisible()
  const filas = page.getByTestId('ganadores-fila')
  await expect(filas.first()).toBeVisible({ timeout: 15000 })
  const ganancias = await filas.evaluateAll((nodos) => nodos.map((nodo) => {
    const match = nodo.innerText.match(/([\d.]+)\s*\n\s*Ganancia/i)
    return match ? Number(match[1].replace(/\./g, '')) : null
  }).filter((valor) => valor !== null))
  expect(ganancias.length, 'filas con ganancia visible').toBeGreaterThan(0)
  for (let i = 1; i < ganancias.length; i += 1) {
    expect(ganancias[i - 1], `el ranking baja en la fila ${i + 1}`).toBeGreaterThanOrEqual(ganancias[i])
  }
  await expect(filas.first()).toContainText(/margen/i)
  await page.screenshot({ path: join(SALIDA, 'ganadores-produccion-desktop.png'), fullPage: true })
  return `${ganancias.length} productos · primera ganancia ${ganancias[0]}`
})

await ver('Demo: finanzas no llama al API ni ensucia la consola', async () => {
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
console.log('Finanzas verificadas. Capturas en ' + SALIDA)
