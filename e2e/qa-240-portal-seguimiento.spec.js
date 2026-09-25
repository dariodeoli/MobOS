// #240 — Seguimiento de la entrega en el portal: la cuenta del cliente muestra
// los pasos del envío/retiro con sus fechas (sin abrir el comprobante). Cuenta
// real del harness + recorrido demo.
import { test, expect } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'

const API = SEED.api
const SALIDA = 'test-results/QA-240-portal-seguimiento'

async function api(page, path, options = {}) {
  return page.evaluate(async ({ api, path, options }) => {
    const response = await fetch(`${api}${path}`, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...options })
    const body = await response.json().catch(() => null)
    return { status: response.status, body }
  }, { api: API, path, options })
}

test('la cuenta muestra los pasos del envío con su fecha', async ({ page }) => {
  await page.goto('/clientes')
  const marca = Date.now().toString(36).toUpperCase()

  // Producto propio con stock simple (sin unidades serializadas).
  const altaProducto = await api(page, '/api/products', {
    method: 'POST',
    body: JSON.stringify({ name: `Producto seguimiento ${marca}`, sku: `QA240S-${marca}`, pricePyg: 300000, stock: 3 }),
  })
  expect([200, 201], JSON.stringify(altaProducto.body)).toContain(altaProducto.status)
  const producto = altaProducto.body
  expect(producto?.id, 'se creó el producto').toBeTruthy()

  const cliente = await api(page, '/api/customers', {
    method: 'POST',
    body: JSON.stringify({ name: `Cliente Seguimiento ${marca}`, phone: `0983${String(Date.now()).slice(-6)}` }),
  })
  expect(cliente.status, JSON.stringify(cliente.body)).toBe(201)

  const pedido = await api(page, '/api/orders', {
    method: 'POST',
    body: JSON.stringify({
      orderNumber: `QA-SEG-${marca}`,
      customerId: cliente.body.id,
      deliveryType: 'DELIVERY',
      items: [{ productId: producto.id, description: producto.name || producto.nombre, quantity: 1, unitPricePyg: 100000 }],
      payment: { method: 'CASH', amountPyg: 100000 },
    }),
  })
  expect(pedido.status, JSON.stringify(pedido.body)).toBe(201)
  const envio = await api(page, `/api/orders/${pedido.body.id}`, { method: 'PATCH', body: JSON.stringify({ fulfillmentStatus: 'IN_TRANSIT' }) })
  expect(envio.status, JSON.stringify(envio.body)).toBe(200)

  const portal = await api(page, `/api/customers/${encodeURIComponent(cliente.body.id)}/access-token`, {
    method: 'POST',
    body: JSON.stringify({ level: 'rapido' }),
  })
  expect(portal.status, JSON.stringify(portal.body)).toBe(200)
  expect(portal.body.token).toBeTruthy()

  await page.goto(`/cuenta/${encodeURIComponent(portal.body.token)}`)
  await expect(page.getByText('Seguimiento de envío')).toBeVisible({ timeout: 20000 })
  const pasos = page.getByTestId('portal-pasos-entrega').first()
  await expect(pasos).toBeVisible()
  await expect(pasos.getByText('En preparación')).toBeVisible()
  await expect(pasos.getByText('En camino al cliente')).toBeVisible()
  await expect(pasos.getByText('Listo para enviar')).toBeVisible()
  await page.screenshot({ path: `${SALIDA}/01-cuenta-pasos-envio.png`, fullPage: true })
})

test('demo: la cuenta sigue el envío y el retiro con datos del navegador', async ({ browser }) => {
  const contexto = await browser.newContext({ viewport: { width: 1280, height: 1100 } })
  const page = await contexto.newPage()

  // Lucía: su pedido está en camino (delivery).
  await page.goto('/cuenta/demo-demo-cliente-lucia-rapido')
  await expect(page.getByText('Seguimiento de envío')).toBeVisible({ timeout: 20000 })
  const pasos = page.getByTestId('portal-pasos-entrega').first()
  await expect(pasos.getByText('En camino al cliente')).toBeVisible()
  await page.screenshot({ path: `${SALIDA}/02-demo-envio.png`, fullPage: true })

  // Carlos: su pedido ya está listo para retirar (retiro en el local).
  await page.goto('/cuenta/demo-demo-cliente-carlos-rapido')
  await expect(page.getByText('Seguimiento de retiro')).toBeVisible({ timeout: 20000 })
  await expect(page.getByTestId('portal-pasos-entrega').first().getByText('Listo para retirar')).toBeVisible()
  await page.screenshot({ path: `${SALIDA}/03-demo-retiro.png`, fullPage: true })
  await contexto.close()
})
