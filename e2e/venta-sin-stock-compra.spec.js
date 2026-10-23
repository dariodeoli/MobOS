// Venta sin stock · de la venta a la entrega, en Por comprar (mobile first).
//
// Venta sin stock → comprar SIN costo → cargar el costo después (llega a la venta
// original, margen en la fecha de la venta) → marcar pagado eligiendo cuenta
// (salida de caja una sola vez) → Recibido rápido → el pedido público muestra el
// estado en vivo. Capturas opcionales: SIN_STOCK_CAPTURAS=1 → docs/rediseno/sin-stock-*.png.
import { test, expect } from '@playwright/test'
import { join } from 'node:path'
import { SEED } from './helpers/seed-data.js'
import { esperarAnimaciones } from './helpers/animaciones.js'

const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`
const CAPTURAS = process.env.SIN_STOCK_CAPTURAS === '1'
const FOTO = (nombre) => join('docs', 'rediseno', `sin-stock-${nombre}.png`)

async function api(page, ruta, opciones = {}) {
  return page.evaluate(async ({ api, ruta, opciones }) => {
    const response = await fetch(`${api}${ruta}`, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...opciones })
    const body = await response.json().catch(() => null)
    return { status: response.status, body }
  }, { api: API, ruta, opciones })
}

test('venta sin stock: comprar sin costo, costo después, pagado con cuenta, recibido y pedido público', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/abastecimiento')
  await expect(page.getByTestId('por-comprar')).toBeVisible()
  const marca = Date.now().toString(36)
  const COSTO = 61000

  // Datos de la prueba: cuenta de salida, producto sin costo y una venta sobre pedido.
  const cuenta = await api(page, '/api/payment-accounts', { method: 'POST', body: JSON.stringify({ name: `Caja proveedores ${marca}`, kind: 'CASH', currency: 'PYG' }) })
  expect(cuenta.status, JSON.stringify(cuenta.body)).toBe(201)
  const producto = await api(page, '/api/products', { method: 'POST', body: JSON.stringify({ sku: `E2E-VSS-${marca}`, name: `Cargador sin stock ${marca}`, category: 'Accesorios', pricePyg: 100000, stock: 0, branchId: SEED.branchId }) })
  expect(producto.status, JSON.stringify(producto.body)).toBe(201)
  const cliente = await api(page, '/api/customers', { method: 'POST', body: JSON.stringify({ name: `Cliente sin stock ${marca}`, phone: `981${marca.replace(/\D/g, '').padEnd(6, '1').slice(0, 6)}`, countryCode: '+595' }) })
  expect(cliente.status, JSON.stringify(cliente.body)).toBe(201)
  const prometida = new Date(Date.now() + 4 * 86400000).toISOString()
  const pedido = await api(page, '/api/orders', {
    method: 'POST',
    body: JSON.stringify({ orderNumber: `E2E-VSS-${marca}`, customerId: cliente.body.id, promisedAt: prometida, items: [{ productId: producto.body.id, description: producto.body.name, quantity: 2, unitPricePyg: 100000, backorder: true }] }),
  })
  expect(pedido.status, JSON.stringify(pedido.body)).toBe(201)
  const margenAntes = (await api(page, '/api/finance')).body.margin

  // 1) Por comprar › Ventas sin stock: la fila trae cliente, pedido, fecha y UNA acción.
  await page.goto('/abastecimiento')
  await page.getByRole('tab', { name: /^Ventas sin stock/ }).click()
  const fila = page.getByTestId('venta-sin-stock-fila').filter({ hasText: producto.body.name })
  await expect(fila).toBeVisible()
  await expect(fila.getByTestId('venta-sin-stock-estado')).toHaveText('Por comprar')
  await expect(fila).toContainText(`Cliente sin stock ${marca}`)
  await expect(fila.getByTestId('venta-sin-stock-principal')).toHaveText('Comprar')
  await esperarAnimaciones(page)
  const alturaPrincipal = await fila.getByTestId('venta-sin-stock-principal').evaluate((nodo) => nodo.getBoundingClientRect().height)
  expect(alturaPrincipal, 'la acción principal mide al menos 44 px').toBeGreaterThanOrEqual(44)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'sin scroll horizontal en 390 px').toBe(true)
  if (CAPTURAS) await page.screenshot({ path: FOTO('01-por-comprar-390') })

  // 2) Comprar SIN costo (opcional): queda «Comprado» con «Falta costo».
  await fila.getByTestId('venta-sin-stock-principal').click()
  const hojaComprar = page.getByRole('dialog', { name: 'Comprar' })
  await expect(hojaComprar).toBeVisible()
  await hojaComprar.locator('#compra-proveedor').fill(`Proveedor VSS ${marca}`)
  await expect(hojaComprar.getByLabel('Cantidad a comprar')).toHaveValue('2')
  if (CAPTURAS) await page.screenshot({ path: FOTO('02-hoja-comprar-390') })
  const [respuestaCompra] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/supply/purchases') && r.request().method() === 'POST'),
    hojaComprar.getByRole('button', { name: 'Registrar compra' }).click(),
  ])
  expect(respuestaCompra.status(), await respuestaCompra.text()).toBe(201)
  await expect(fila.getByTestId('venta-sin-stock-estado')).toHaveText('Comprado')
  await expect(fila.getByTestId('chip-falta-costo')).toBeVisible()
  await expect(fila.getByTestId('venta-sin-stock-principal')).toHaveText('Cargar costo')
  // Los filtros cuentan la fila como «Sin costo».
  await expect(page.getByTestId('filtro-sin-costo')).toContainText('(1')

  // 3) Costo después: llega a la venta original y el margen queda en la fecha de la venta.
  await fila.getByTestId('venta-sin-stock-principal').click()
  const hojaCosto = page.getByRole('dialog', { name: 'Cargar costo' })
  await hojaCosto.getByLabel('Costo unitario').fill(String(COSTO))
  await hojaCosto.getByRole('button', { name: 'Guardar costo' }).click()
  await expect(fila.getByTestId('chip-falta-costo')).toHaveCount(0)
  await expect(fila.getByTestId('venta-sin-stock-principal')).toHaveText('Marcar pagado')
  const detalle = (await api(page, `/api/orders/${pedido.body.id}`)).body
  expect(Number(detalle.items[0].unitCostPyg)).toBe(COSTO)
  const margenDespues = (await api(page, '/api/finance')).body.margin
  expect(Number(margenDespues.costPyg) - Number(margenAntes.costPyg), 'el costo entra al margen de la venta original').toBe(COSTO * 2)

  // 4) Marcar pagado eligiendo la cuenta: una sola salida de caja por el monto completo.
  await fila.getByTestId('venta-sin-stock-principal').click()
  const hojaPagar = page.getByRole('dialog', { name: 'Marcar pagado' })
  await hojaPagar.getByLabel('Cuenta de origen').selectOption({ label: `Caja proveedores ${marca}` })
  await hojaPagar.getByRole('button', { name: 'Marcar pagado' }).click()
  await expect(fila.getByTestId('venta-sin-stock-principal')).toHaveText('Recibido')
  const finanzas = (await api(page, '/api/finance')).body
  const salidas = finanzas.movements.filter((movimiento) => movimiento.direction === 'OUT' && String(movimiento.description).includes('Pago de compra'))
  expect(salidas.filter((movimiento) => Number(movimiento.amountPyg) === COSTO * 2 && movimiento.account?.name === `Caja proveedores ${marca}`)).toHaveLength(1)

  // 5) Recibido rápido (producto sin serial): un toque y la cantidad.
  await fila.getByTestId('venta-sin-stock-principal').click()
  const hojaRecibir = page.getByRole('dialog', { name: 'Recibido' })
  await expect(hojaRecibir.getByLabel('Unidades que llegaron')).toHaveValue('2')
  await hojaRecibir.getByRole('button', { name: 'Confirmar llegada' }).click()
  await expect(fila.getByTestId('venta-sin-stock-estado')).toHaveText('Llegó')
  await expect(fila.getByTestId('venta-sin-stock-principal')).toHaveText('Avisar al cliente')

  // 6) El pedido público muestra el estado en vivo, sin costos.
  const acceso = await api(page, `/api/orders/${pedido.body.id}/access-tokens`, { method: 'POST', body: JSON.stringify({ level: 'rapido' }) })
  expect([200, 201]).toContain(acceso.status)
  await page.goto(`/pedido/${acceso.body.token}`)
  const franja = page.getByTestId('estado-de-tu-pedido')
  await expect(franja).toBeVisible()
  await expect(page.getByTestId('estado-de-tu-pedido-titulo')).toHaveText('Listo para retirar')
  await expect(franja).not.toContainText(/costo|proveedor/i)
  if (CAPTURAS) await page.screenshot({ path: FOTO('03-pedido-publico-390') })
})
