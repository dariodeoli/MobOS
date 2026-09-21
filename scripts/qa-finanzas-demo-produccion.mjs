// Verificación post-deploy de las issues cerradas de Finanzas en el demo
// público: #144 (conciliación y trazabilidad), #161 (caja y auditoría de
// efectivo) y #162 (seguro y margen). Solo lectura, sin credenciales.
//
// Uso: QA_BASE_URL=https://app.moboss.online node scripts/qa-finanzas-demo-produccion.mjs
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect } from '@playwright/test'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = (process.env.QA_BASE_URL || 'https://app.moboss.online').replace(/\/$/, '')
const SALIDA = { 144: join(RAIZ, 'docs/qa/144'), 161: join(RAIZ, 'docs/qa/161'), 162: join(RAIZ, 'docs/qa/162') }
for (const carpeta of Object.values(SALIDA)) mkdirSync(carpeta, { recursive: true })

const resultados = []
const ver = async (issue, nombre, fn) => {
  try {
    await fn()
    resultados.push({ issue, nombre, ok: true })
    console.log(`OK    #${issue} · ${nombre}`)
  } catch (error) {
    const detalle = String(error?.message || error).slice(0, 300)
    resultados.push({ issue, nombre, ok: false, detalle })
    console.log(`FALLO #${issue} · ${nombre} — ${detalle.slice(0, 180)}`)
  }
}

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 980 } })
const page = await ctx.newPage()
const erroresConsola = []
page.on('console', (msg) => { if (msg.type() === 'error') erroresConsola.push(msg.text().slice(0, 200)) })
page.on('pageerror', (error) => erroresConsola.push(`pageerror: ${error.message}`))

// Entrada al demo anónimo como dueño.
await page.goto(`${BASE}/demo`)
await page.getByRole('button', { name: /Entrar como Dueño/i }).click()
await page.waitForLoadState('networkidle')

// ── #144 · Conciliación y trazabilidad ──────────────────────────────────────
await ver(144, 'la portada muestra ingresos por cuenta, medio y procesadora', async () => {
  await page.goto(`${BASE}/finanzas/conciliacion`)
  await expect(page.getByRole('heading', { name: 'Conciliación y trazabilidad' })).toBeVisible({ timeout: 30000 })
  for (const etiqueta of ['Ingresos conciliables', 'Conciliado', 'Por conciliar', 'Diferencia de lotes']) {
    await expect(page.getByText(etiqueta, { exact: false }).first()).toBeVisible()
  }
  await expect(page.getByRole('heading', { name: /Cuentas del período|Medios del período|Procesadoras del período/ })).toBeVisible()
  await page.screenshot({ path: join(SALIDA[144], 'conciliacion-resumen.jpg'), type: 'jpeg', quality: 70 })
})

await ver(144, 'la conciliación en lote queda con su estado y la trazabilidad abre el pedido', async () => {
  // Un lote cubre una sola cuenta (regla del servidor y del demo): se elige el
  // primer pago pendiente, no todos.
  const filas = page.getByTestId('conciliacion-fila')
  let elegida = false
  for (let i = 0; i < Math.min(await filas.count(), 8) && !elegida; i++) {
    const casilla = filas.nth(i).getByRole('checkbox')
    if (await casilla.isEnabled().catch(() => false)) {
      await casilla.check()
      elegida = true
    }
  }
  if (elegida) {
    const conciliar = page.getByRole('button', { name: 'Conciliar lote' })
    await expect(conciliar).toBeVisible()
    await page.screenshot({ path: join(SALIDA[144], 'conciliacion-lote-antes.jpg'), type: 'jpeg', quality: 70 })
    await conciliar.click()
    await expect(page.getByTestId('conciliacion-lote').first()).toBeVisible({ timeout: 15000 })
  }
  await page.screenshot({ path: join(SALIDA[144], 'conciliacion-lote.jpg'), type: 'jpeg', quality: 70 })
  const verPedido = page.getByRole('button', { name: 'Ver pedido' }).first()
  if (await verPedido.isEnabled().catch(() => false)) {
    await verPedido.click()
    await expect(page.getByText(/Pagos|Cobros/i).filter({ visible: true }).first()).toBeVisible({ timeout: 15000 })
    await page.screenshot({ path: join(SALIDA[144], 'conciliacion-trazabilidad.jpg'), type: 'jpeg', quality: 70 })
  }
})

// ── #161 · Caja y auditoría de efectivo ─────────────────────────────────────
await ver(161, 'la caja muestra el turno, los medios y la auditoría de efectivo', async () => {
  await page.goto(`${BASE}/finanzas/caja`)
  await expect(page.getByRole('heading', { name: /Abrir caja|Cerrar caja/ })).toBeVisible({ timeout: 30000 })
  if (await page.getByRole('heading', { name: 'Abrir caja' }).count()) {
    await page.getByRole('button', { name: 'Abrir caja', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Cerrar caja' })).toBeVisible({ timeout: 15000 })
  }
  await expect(page.getByRole('heading', { name: 'Entradas por medio de pago' })).toBeVisible({ timeout: 20000 })
  await expect(page.getByRole('heading', { name: 'Auditoría de efectivo' })).toBeVisible({ timeout: 20000 })
  await page.screenshot({ path: join(SALIDA[161], 'caja.jpg'), type: 'jpeg', quality: 70, fullPage: false })
})

await ver(161, 'una marca con diferencia pide observación y queda registrada', async () => {
  const fila = page.getByTestId('auditoria-fila').first()
  await expect(fila).toBeVisible({ timeout: 20000 })
  const estado = fila.getByLabel(/Estado de/).first()
  await estado.selectOption('DIFFERENCE')
  await fila.getByRole('textbox', { name: 'Observación' }).fill('Falta efectivo (QA post-deploy)')
  const guardar = fila.getByRole('button', { name: 'Guardar' })
  if (await guardar.isEnabled()) {
    await guardar.click()
    await expect(page.getByText('Con diferencia').first()).toBeVisible({ timeout: 15000 })
  }
  await page.screenshot({ path: join(SALIDA[161], 'auditoria-efectivo.jpg'), type: 'jpeg', quality: 70 })
})

// ── #162 · Seguro y margen ──────────────────────────────────────────────────
await ver(162, 'el seguro de la empresa se configura y se ve en el margen', async () => {
  await page.goto(`${BASE}/configuracion/negocio`)
  await expect(page.locator('#seguro-pct')).toBeVisible({ timeout: 30000 })
  await page.locator('#seguro-toggle').check({ force: true })
  await expect(page.locator('#seguro-pct')).toHaveValue('25')
  await page.getByRole('button', { name: 'Guardar seguro' }).click()
  await expect(page.getByText('Seguro guardado en este navegador (demo).')).toBeVisible()
  await page.screenshot({ path: join(SALIDA[162], 'seguro-config.jpg'), type: 'jpeg', quality: 70 })
  // El demo vive en memoria de la pestaña: se navega dentro de la app para ver
  // el efecto del seguro en el margen, sin recargar.
  await page.getByRole('button', { name: 'Análisis', exact: true }).first().click()
  await page.getByRole('tab', { name: 'Ganancias' }).click()
  await expect(page.getByRole('heading', { name: 'Cómo se calcula' })).toBeVisible({ timeout: 20000 })
  await expect(page.getByText('Incluye seguro 25% (demo)')).toBeVisible({ timeout: 15000 })
  await page.screenshot({ path: join(SALIDA[162], 'ganancias-margen.jpg'), type: 'jpeg', quality: 70 })
})

await ver(144, 'sin errores de consola propios en el recorrido', async () => {
  const RUIDO = /non-boolean attribute|Failed to load resource|ERR_CONNECTION_REFUSED|React Router Future Flag|ResizeObserver|favicon/i
  expect(erroresConsola.filter((texto) => !RUIDO.test(texto))).toEqual([])
})

for (const [issue, filas] of Object.entries(resultados.reduce((acc, fila) => ({ ...acc, [fila.issue]: [...(acc[fila.issue] || []), fila] }), {}))) {
  writeFileSync(join(SALIDA[issue], 'resultados.json'), JSON.stringify({ base: BASE, issue: Number(issue), resultados: filas }, null, 2))
}
await browser.close()
const fallos = resultados.filter((fila) => !fila.ok)
console.log(`\n${resultados.length - fallos.length}/${resultados.length} verificaciones OK`)
if (fallos.length) process.exitCode = 1
