// #240 → portal — Detalle del pedido en la cuenta del cliente: cada pedido
// despliega qué se compró (líneas) y qué se pagó (medios y fechas de ese
// pedido), sin costos ni datos internos. Cuenta real del harness + demo.
import { test, expect } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'

const API = SEED.api
const SHOTS = process.env.MOBOS_CAPTURAS || 'test-results/QA-240-portal-pedido-detalle'

async function api(page, path, options = {}) {
  return page.evaluate(async ({ api, path, options }) => {
    const response = await fetch(`${api}${path}`, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...options })
    const body = await response.json().catch(() => null)
    return { status: response.status, body }
  }, { api: API, path, options })
}

test('la cuenta despliega las líneas y los pagos del pedido', async ({ page }) => {
  await page.goto('/clientes')
  const marca = Date.now().toString(36).toUpperCase()

  const producto = await api(page, '/api/products', {
    method: 'POST',
    body: JSON.stringify({ name: `Producto detalle ${marca}`, sku: `QA240D-${marca}`, pricePyg: 300000, stock: 3 }),
  })
  expect([200, 201], JSON.stringify(producto.body)).toContain(producto.status)

  const cliente = await api(page, '/api/customers', {
    method: 'POST',
    body: JSON.stringify({ name: `Cliente Detalle ${marca}`, phone: `0987${String(Date.now()).slice(-6)}` }),
  })
  expect(cliente.status, JSON.stringify(cliente.body)).toBe(201)

  const pedido = await api(page, '/api/orders', {
    method: 'POST',
    body: JSON.stringify({
      orderNumber: `QA-DET-${marca}`,
      customerId: cliente.body.id,
      items: [{ productId: producto.body.id, description: producto.body.name || producto.body.nombre, quantity: 1, unitPricePyg: 100000 }],
      payment: { method: 'CASH', amountPyg: 40000 },
    }),
  })
  expect(pedido.status, JSON.stringify(pedido.body)).toBe(201)

  const portal = await api(page, `/api/customers/${encodeURIComponent(cliente.body.id)}/access-token`, {
    method: 'POST',
    body: JSON.stringify({ level: 'rapido' }),
  })
  expect(portal.status, JSON.stringify(portal.body)).toBe(200)

  await page.goto(`/cuenta/${encodeURIComponent(portal.body.token)}`)
  const boton = page.getByTestId('pedido-detalle-boton').first()
  await expect(boton).toBeVisible({ timeout: 20000 })
  await boton.click()
  const detalle = page.getByTestId('pedido-detalle').first()
  await expect(detalle).toBeVisible()
  await expect(detalle.getByText('Qué compraste')).toBeVisible()
  await expect(detalle.getByText(new RegExp(`1 × Producto detalle ${marca}`))).toBeVisible()
  await expect(detalle.getByText('Tus pagos de este pedido')).toBeVisible()
  await expect(detalle.getByText(/Efectivo/)).toBeVisible()
  await expect(detalle.getByText(/40\.000/)).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/01-cuenta-detalle-pedido.png`, fullPage: true })
})

test('demo: el detalle del pedido se arma con los datos de la pestaña', async ({ browser }) => {
  const contexto = await browser.newContext({ viewport: { width: 1280, height: 1100 } })
  const page = await contexto.newPage()

  await page.goto('/cuenta/demo-demo-cliente-lucia-rapido')
  const boton = page.getByTestId('pedido-detalle-boton').first()
  await expect(boton).toBeVisible({ timeout: 20000 })
  await boton.click()
  const detalle = page.getByTestId('pedido-detalle').first()
  await expect(detalle.getByText(/iPhone 15 · 128 GB/)).toBeVisible()
  await expect(detalle.getByText('Tus pagos de este pedido')).toBeVisible()
  await expect(detalle.getByText(/1\.500\.000/)).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/02-demo-detalle-pedido.png`, fullPage: true })

  await contexto.close()
})
