// Portal del cliente por QR desde la ficha: el vendedor abre el resumen
// público (saldo pendiente y pedidos) sin exponer datos internos.

import { test, expect } from '@playwright/test'

const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`

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

test('el portal del cliente se abre desde la ficha y muestra el saldo pendiente', async ({ page }) => {
  await page.goto('/clientes')
  const marca = Date.now()

  const productos = await api(page, '/api/products?q=E2E-CABLE')
  expect(productos.status).toBe(200)
  const cable = (productos.body || []).find((row) => row.sku === 'E2E-CABLE')
  expect(cable?.id, 'El producto sembrado E2E-CABLE debe existir.').toBeTruthy()

  const cliente = await api(page, '/api/customers', { method: 'POST', body: JSON.stringify({ name: `Cliente Portal ${marca}` }) })
  expect(cliente.status).toBe(201)

  const numeroPedido = `E2E-PORTAL-${marca}`
  const pedido = await api(page, '/api/orders', {
    method: 'POST',
    body: JSON.stringify({
      orderNumber: numeroPedido,
      customerId: cliente.body.id,
      items: [{ productId: cable.id, description: cable.name, quantity: 2, unitPricePyg: cable.pricePyg }],
      payment: { method: 'CASH', amountPyg: 30000 },
    }),
  })
  expect(pedido.status).toBe(201)

  // La ficha abre directo por ?cliente= y ofrece el portal en la cabecera.
  await page.goto(`/clientes?cliente=${encodeURIComponent(cliente.body.id)}`)
  const ficha = page.getByRole('dialog')
  await expect(ficha.getByRole('heading', { name: cliente.body.name })).toBeVisible()
  await ficha.getByRole('button', { name: 'Portal del cliente' }).click()
  await expect(page.getByAltText('QR del portal del cliente')).toBeVisible()
  await expect(ficha.getByRole('button', { name: 'Rápido', exact: true })).toHaveAttribute('aria-pressed', 'true')
  const enlace = await page.locator('p.break-all').textContent()
  expect(enlace).toContain('/cuenta/')

  // "Abrir" lleva al resumen público: saldo pendiente = total − pagos.
  const popup = page.context().waitForEvent('page')
  await page.getByRole('button', { name: 'Abrir', exact: true }).click()
  const portal = await popup
  await portal.waitForLoadState()
  await expect(portal.getByRole('heading', { name: 'Tienda E2E' })).toBeVisible()
  await expect(portal.getByText('Saldo pendiente')).toBeVisible()
  await expect(portal.getByText('Gs 60.000').first()).toBeVisible()
  await expect(portal.getByText(numeroPedido)).toBeVisible()
  await expect(portal.getByText('Al día')).toHaveCount(0)

  // El selector de nivel cambia el alcance del portal (dentro de la ficha).
  await ficha.getByRole('button', { name: 'Completo', exact: true }).click()
  await expect(page.getByText('Además garantías activas, direcciones y comprobantes.')).toBeVisible()
})
