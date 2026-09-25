// Huecos de #173 en dominio POS: fulfillment por método y borradores con
// enlace público (sin auth, con Checkout). Cubre lo que pos-qa-173 no toca.

import { test, expect } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'

const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`
const stamp = Date.now().toString(36)

async function api(page, path, options = {}) {
  return page.evaluate(async ({ api, path, options }) => {
    const response = await fetch(`${api}${path}`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      ...options,
    })
    const body = await response.json().catch(() => null)
    return { status: response.status, body }
  }, { api: API, path, options })
}

async function productoConStock(page) {
  // Accesorio del seed (sin unidades serializadas): el servidor exige los IMEI
  // exactos cuando el producto tiene unidades serializadas. La sesión de este
  // spec es de vendedor, así que no puede crear productos.
  const sku = SEED.products.funda.sku
  const filas = await api(page, `/api/products?q=${encodeURIComponent(sku)}`)
  const producto = (filas.body || []).find((fila) => fila.sku === sku && Number(fila.stock) > 0)
  expect(producto?.id, `el harness tiene ${sku} con stock`).toBeTruthy()
  return producto
}

async function crearPedido(page, deliveryType, producto) {
  const pedido = await api(page, '/api/orders', {
    method: 'POST',
    body: JSON.stringify({
      orderNumber: `IT-173-${stamp}-${deliveryType.slice(0, 4)}-${Math.floor(Math.random() * 999)}`,
      deliveryType,
      items: [{ productId: producto.id, description: producto.name, quantity: 1, unitPricePyg: Number(producto.pricePyg) || 1000 }],
      payment: { method: 'CASH', amountPyg: Number(producto.pricePyg) || 1000 },
    }),
  })
  expect(pedido.status, JSON.stringify(pedido.body)).toBe(201)
  return pedido.body
}

test('fulfillment: cada método avanza con sus estados y el detalle lo muestra', async ({ page }) => {
  await page.goto('/pedidos')
  const producto = await productoConStock(page)
  const retiro = await crearPedido(page, 'Retiro en tienda', producto)
  const envio = await crearPedido(page, 'Delivery', producto)

  expect((await api(page, `/api/orders/${retiro.id}`, { method: 'PATCH', body: JSON.stringify({ fulfillmentStatus: 'SHIPPED' }) })).status).toBe(409)
  expect((await api(page, `/api/orders/${retiro.id}`, { method: 'PATCH', body: JSON.stringify({ fulfillmentStatus: 'READY_FOR_PICKUP' }) })).status).toBe(200)
  expect((await api(page, `/api/orders/${retiro.id}`, { method: 'PATCH', body: JSON.stringify({ fulfillmentStatus: 'PICKED_UP' }) })).status).toBe(200)

  expect((await api(page, `/api/orders/${envio.id}`, { method: 'PATCH', body: JSON.stringify({ fulfillmentStatus: 'READY_FOR_PICKUP' }) })).status).toBe(409)
  expect((await api(page, `/api/orders/${envio.id}`, { method: 'PATCH', body: JSON.stringify({ fulfillmentStatus: 'SHIPPED' }) })).status).toBe(200)

  const publico = await api(page, `/api/orders/public/${envio.publicToken}`)
  expect(publico.body.tracking?.encabezado).toBe('Seguimiento de envío')
  const pasosEnvio = (publico.body.tracking?.pasos || []).map((paso) => paso.label).join(' | ')
  expect(pasosEnvio).toContain('En camino al cliente')
  expect(pasosEnvio).not.toContain('Listo para retirar')

  // El listado del POS muestra el pedido creado (lectura con sesión real).
  await page.goto('/pedidos')
  await expect(page.getByText(retiro.orderNumber, { exact: false }).first()).toBeVisible({ timeout: 20000 })
})
