// Abastecimiento F6 (#250/#254) · panel de métricas (vista propia, como
// «Preparar compra» y «Recepción»): rendimiento por
// proveedor con costo real por unidad, tiempos de tránsito (CDE → Asunción
// incluida) y atrasos del momento. La prueba siembra por API una compra recibida
// y un lote atrasado, y verifica el panel, las capturas y el scroll.
//
// Capturas: `QA_F6_CAPTURAS` (default test-results/qa-f6) — se versionan en
// docs/qa/f6-metricas/.
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { SEED } from './helpers/seed-data.js'

const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`
const DIR = process.env.QA_F6_CAPTURAS || join('test-results', 'qa-f6')

// API desde la página: la cookie de sesión y el origen son los de la app.
const apiPagina = (page, ruta, opciones = {}) => page.evaluate(async ({ api, ruta, opciones }) => {
  const response = await fetch(`${api}${ruta}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...opciones,
  })
  const body = await response.json().catch(() => null)
  return { status: response.status, body }
}, { api: API, ruta, opciones })

// IMEI con dígito verificador válido (Luhn), único por corrida.
function imeiValido(base14) {
  let suma = 0
  for (let i = 0; i < 14; i += 1) { let digito = Number(base14[13 - i]); if (i % 2 === 0) { digito *= 2; if (digito > 9) digito -= 9 } suma += digito }
  return base14 + String((10 - (suma % 10)) % 10)
}

const enDias = (dias) => new Date(Date.now() + dias * 86_400_000).toISOString()

async function sembrarProducto(page, nombre, sku, costoPyg) {
  const { status, body } = await apiPagina(page, '/api/products', {
    method: 'POST',
    body: JSON.stringify({ name: nombre, sku, category: 'Accesorios', pricePyg: costoPyg * 2, costPyg: costoPyg, stock: 0, branchId: SEED.branchId }),
  })
  expect([200, 201], `POST /api/products → ${status} ${JSON.stringify(body)}`).toContain(status)
  return body
}

async function sembrarCompra(page, { proveedor, producto, cantidad, costoTotal, etaAt, seriales = [] }) {
  const compra = await apiPagina(page, '/api/supply/purchases', {
    method: 'POST',
    body: JSON.stringify({
      supplierName: proveedor,
      currency: 'PYG',
      originalCost: costoTotal,
      lines: [{ productId: producto.id, quantity: cantidad, ...(seriales.length ? { serials: seriales } : {}) }],
    }),
  })
  expect([200, 201], `POST /api/supply/purchases → ${compra.status} ${JSON.stringify(compra.body)}`).toContain(compra.status)
  const lote = await apiPagina(page, '/api/supply/shipments', {
    method: 'POST',
    body: JSON.stringify({ purchaseId: compra.body.id, origin: 'CDE', destinationBranchId: SEED.branchId, method: 'BUS', company: 'Bus del Este', etaAt }),
  })
  expect([200, 201], `POST /api/supply/shipments → ${lote.status} ${JSON.stringify(lote.body)}`).toContain(lote.status)
  for (const action of ['prepare', 'dispatch', 'transit']) {
    const paso = await apiPagina(page, '/api/supply/shipments', {
      method: 'PATCH',
      body: JSON.stringify({ id: lote.body.id, action, ...(action === 'dispatch' ? { guide: `G-F6-${Date.now().toString(36)}` } : {}) }),
    })
    expect([200, 201], `${action}: ${paso.status} ${JSON.stringify(paso.body)}`).toContain(paso.status)
  }
  return { compra: compra.body, lote: lote.body }
}

test('Métricas de abastecimiento: costo real por proveedor, tiempos CDE y atrasos', async ({ page }) => {
  mkdirSync(DIR, { recursive: true })
  const sufijo = Date.now().toString(36).toUpperCase()

  await page.goto('/metricas')
  await expect(page.getByTestId('metricas-abastecimiento')).toBeVisible()

  // Depósito para confirmar la recepción (el stock nace recién ahí).
  const deposito = await apiPagina(page, '/api/stock-locations', {
    method: 'POST',
    body: JSON.stringify({ branchId: SEED.branchId, name: `Depósito F6 ${sufijo}`, code: `F6${sufijo.slice(-3)}` }),
  })
  expect([200, 201], `POST /api/stock-locations → ${deposito.status} ${JSON.stringify(deposito.body)}`).toContain(deposito.status)

  // Compra recibida: 2 unidades por Gs. 1.500.000 → costo real Gs. 750.000.
  const base14 = `4901542${String(Date.now()).slice(-7)}`
  const imeiA = imeiValido(base14)
  const imeiB = imeiValido(String(Number(base14) + 1).padStart(14, '0'))
  const producto = await sembrarProducto(page, `Producto F6 ${sufijo}`, `E2E-F6-${sufijo}`, 750_000)
  const proveedor = `Proveedor Métricas ${sufijo}`
  const recibida = await sembrarCompra(page, { proveedor, producto, cantidad: 2, costoTotal: 1_500_000, etaAt: enDias(1), seriales: [imeiA] })

  const abierta = await apiPagina(page, '/api/supply/receptions', { method: 'POST', body: JSON.stringify({ shipmentId: recibida.lote.id }) })
  expect([200, 201], `POST /api/supply/receptions → ${abierta.status} ${JSON.stringify(abierta.body)}`).toContain(abierta.status)
  for (const serial of [imeiA, imeiB]) {
    const escaneo = await apiPagina(page, '/api/supply/receptions', { method: 'PATCH', body: JSON.stringify({ id: abierta.body.recepcion.id, action: 'scan', serial }) })
    expect([200, 201], `scan ${serial}: ${escaneo.status} ${JSON.stringify(escaneo.body)}`).toContain(escaneo.status)
  }
  const confirmada = await apiPagina(page, '/api/supply/receptions', { method: 'PATCH', body: JSON.stringify({ id: abierta.body.recepcion.id, action: 'confirm', locationId: deposito.body.id }) })
  expect([200, 201], `confirm → ${confirmada.status} ${JSON.stringify(confirmada.body)}`).toContain(confirmada.status)
  expect(confirmada.body?.recepcion?.status).toBe('CONFIRMADA')

  // Lote atrasado: ETA de ayer y sigue en tránsito → alerta inmediata.
  const productoAtrasado = await sembrarProducto(page, `Producto atrasado F6 ${sufijo}`, `E2E-F6-ATR-${sufijo}`, 300_000)
  const atrasada = await sembrarCompra(page, { proveedor: `Proveedor Atraso F6 ${sufijo}`, producto: productoAtrasado, cantidad: 1, costoTotal: 300_000, etaAt: enDias(-1) })

  // Refrescar y verificar el resumen y el rendimiento del proveedor.
  await page.getByRole('button', { name: 'Actualizar' }).click()
  await expect(page.getByTestId('metricas-resumen')).toBeVisible()

  const tablaProveedores = page.getByTestId('metricas-proveedores-tabla')
  const filaProveedor = tablaProveedores.locator('tr', { hasText: proveedor })
  await expect(filaProveedor).toBeVisible()
  await expect(filaProveedor.getByText(/Gs\.?\s?1\.500\.000/)).toBeVisible()
  await expect(filaProveedor.getByText(/Gs\.?\s?750\.000/)).toBeVisible()
  await expect(filaProveedor.getByText('100%')).toBeVisible()

  // Tiempos: la ruta CDE → sucursal de la compra recibida se mide en días.
  await page.getByRole('tab', { name: /^Tiempos/ }).click()
  const tablaTiempos = page.getByTestId('metricas-tiempos-tabla')
  await expect(tablaTiempos).toBeVisible()
  const filaRuta = tablaTiempos.locator('tr').filter({ hasText: new RegExp(`CDE → ${SEED.branchName}(?! Dos)`) })
  await expect(filaRuta.first()).toBeVisible()
  await expect(filaRuta.first().getByText('BUS')).toBeVisible()

  // Atrasos: el lote con ETA vencida aparece con su compra y sus días.
  await page.getByRole('tab', { name: /^Atrasos/ }).click()
  const tablaAtrasados = page.getByTestId('metricas-atrasados-tabla')
  await expect(tablaAtrasados).toBeVisible()
  const filaAtrasada = tablaAtrasados.locator('tr', { hasText: atrasada.lote.code })
  await expect(filaAtrasada).toBeVisible()
  await expect(filaAtrasada.getByText('1 día', { exact: true })).toBeVisible()
  await expect(page.getByTestId('metricas-vencidas-tabla')).toBeVisible()

  // Capturas versionadas: claro/oscuro en desktop y mobile, sin scroll horizontal.
  const secciones = [
    ['proveedores', 'Proveedores', 'Rendimiento por proveedor'],
    ['tiempos', 'Tiempos', 'Tiempos de tránsito por ruta'],
    ['atrasos', 'Atrasos', 'Lotes atrasados'],
  ]
  for (const [tema, modo] of [['claro', 'light'], ['oscuro', 'dark']]) {
    await page.addInitScript(({ m }) => { try { localStorage.setItem('mobos:theme', m) } catch { /* sin storage */ } }, { m: modo })
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/metricas')
    await expect(tablaProveedores).toBeVisible()
    for (const [slug, tab, titulo] of secciones) {
      await page.getByRole('tab', { name: new RegExp(`^${tab}`) }).click()
      await expect(page.getByRole('heading', { name: titulo })).toBeVisible()
      await page.screenshot({ path: join(DIR, `f6-metricas-${slug}-${tema}-desktop.png`) })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), `sin scroll horizontal en ${slug} (${tema})`).toBe(true)
    }
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.getByRole('tab', { name: /^Proveedores/ }).click()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), 'sin scroll horizontal a 1440').toBe(true)

    await page.setViewportSize({ width: 390, height: 844 })
    await page.screenshot({ path: join(DIR, `f6-metricas-proveedores-${tema}-mobile.png`) })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), 'sin scroll horizontal en mobile').toBe(true)
  }
})
