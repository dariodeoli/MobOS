// #240 → portal — Seguimiento de la entrega en la vitrina del cliente: los
// pedidos de /portal/<token> muestran el paso a paso del envío/retiro mientras
// están en curso, igual que la cuenta completa. Cuenta real del harness + demo.
import { test, expect } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'

const API = SEED.api
const SHOTS = process.env.MOBOS_CAPTURAS || 'test-results/QA-240-portal-vitrina'

async function api(page, path, options = {}) {
  return page.evaluate(async ({ api, path, options }) => {
    const response = await fetch(`${api}${path}`, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...options })
    const body = await response.json().catch(() => null)
    return { status: response.status, body }
  }, { api: API, path, options })
}

test('la vitrina muestra el seguimiento del pedido en curso', async ({ page }) => {
  await page.goto('/clientes')
  const marca = Date.now().toString(36).toUpperCase()

  const altaProducto = await api(page, '/api/products', {
    method: 'POST',
    body: JSON.stringify({ name: `Producto vitrina ${marca}`, sku: `QA240V-${marca}`, pricePyg: 300000, stock: 3 }),
  })
  expect([200, 201], JSON.stringify(altaProducto.body)).toContain(altaProducto.status)
  const producto = altaProducto.body

  const cliente = await api(page, '/api/customers', {
    method: 'POST',
    body: JSON.stringify({ name: `Cliente Vitrina ${marca}`, phone: `0986${String(Date.now()).slice(-6)}` }),
  })
  expect(cliente.status, JSON.stringify(cliente.body)).toBe(201)

  const pedido = await api(page, '/api/orders', {
    method: 'POST',
    body: JSON.stringify({
      orderNumber: `QA-VIT-${marca}`,
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

  await page.goto(`/portal/${encodeURIComponent(portal.body.token)}`)
  await expect(page.getByText('Seguimiento de envío')).toBeVisible({ timeout: 20000 })
  const pasos = page.getByTestId('portal-pasos-entrega').first()
  await expect(pasos).toBeVisible()
  await expect(pasos.getByText('En camino al cliente')).toBeVisible()
  await expect(pasos.getByText('Listo para enviar')).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/01-vitrina-pasos-envio.png`, fullPage: true })
})

test('demo: la vitrina sigue el envío y el retiro con datos del navegador', async ({ browser }) => {
  const contexto = await browser.newContext({ viewport: { width: 1280, height: 1100 } })
  const page = await contexto.newPage()

  // Lucía: su pedido está en camino (delivery).
  await page.goto('/portal/demo-demo-cliente-lucia-completo')
  await expect(page.getByText('Seguimiento de envío')).toBeVisible({ timeout: 20000 })
  await expect(page.getByTestId('portal-pasos-entrega').first().getByText('En camino al cliente')).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/02-demo-vitrina-envio.png`, fullPage: true })

  // Carlos: su pedido ya está listo para retirar (retiro en el local).
  await page.goto('/portal/demo-demo-cliente-carlos-completo')
  await expect(page.getByText('Seguimiento de retiro')).toBeVisible({ timeout: 20000 })
  await expect(page.getByTestId('portal-pasos-entrega').first().getByText('Listo para retirar')).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/03-demo-vitrina-retiro.png`, fullPage: true })

  await contexto.close()
})
