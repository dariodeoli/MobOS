// Pedido especial con seña (issue #108) desde el POS: la venta se toma con un
// anticipo y una fecha esperada, la seña queda visible en la cronología de
// pagos con su saldo pendiente y al entregar se cobra el saldo con el mismo
// camino de pagos.

import { test, expect } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'

const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`
const marca = Date.now().toString(36).toUpperCase()
const clienteNombre = `Cliente Seña ${marca}`

const PRECIO = SEED.products.funda.pricePyg
const SENA = 30000
const SALDO = PRECIO - SENA

const gs = (value) => `Gs ${Number(value).toLocaleString('es-PY')}`

test('pedido especial: seña, saldo vinculado y cobro al entregar', async ({ page }) => {
  await page.goto('/pos/cargar')
  await expect(page.getByRole('heading', { name: 'Nueva venta' })).toBeVisible()
  await page.getByLabel('Nombre, teléfono, CI o RUC del cliente').fill(clienteNombre)
  await page.getByPlaceholder('Buscar producto…').fill('Funda')
  await page.getByRole('button', { name: new RegExp(SEED.products.funda.name) }).click()
  await page.getByRole('button', { name: 'Revisar carrito', exact: true }).first().click()
  await page.getByRole('button', { name: 'Ir a cobrar' }).click()

  // Marca de pedido especial con la fecha esperada de llegada/entrega.
  await page.getByText('Pedido especial con seña').click()
  await page.getByLabel('Fecha esperada (opcional)').fill('2026-11-20')

  // Seña: pago parcial anticipado del pedido.
  const pagos = page.locator('div.space-y-3').filter({ has: page.getByText('Pagos de esta venta') })
  await page.getByRole('button', { name: '+ Agregar pago' }).click()
  await pagos.getByLabel('Cuenta de cobro').selectOption({ label: 'Caja E2E · PYG · CASH' })
  await pagos.getByLabel('Monto original').fill(String(SENA))
  await expect(pagos.getByText('Pendiente').first().locator('strong')).toHaveText(gs(SALDO))
  await page.getByRole('button', { name: /^Guardar venta/ }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Venta registrada correctamente' })).toBeVisible()

  // El pedido quedó marcado, con fecha esperada y saldo pendiente.
  const pedido = await page.evaluate(
    async ({ api, cliente }) => {
      const ordenes = await (await fetch(`${api}/api/orders`, { credentials: 'include' })).json()
      const orden = (ordenes || []).find(row => row.customer?.name === cliente)
      return orden ? { id: orden.id, orderNumber: orden.orderNumber, isSpecialOrder: orden.isSpecialOrder, expectedAt: orden.expectedAt, status: orden.status } : null
    },
    { api: API, cliente: clienteNombre },
  )
  expect(pedido?.id).toBeTruthy()
  expect(pedido?.isSpecialOrder).toBe(true)
  expect(String(pedido?.expectedAt || '').slice(0, 10)).toBe('2026-11-20')
  expect(pedido?.status).toBe('PENDING')

  // La seña se ve en la cronología de pagos con su saldo, desde el detalle de
  // ventas del resumen.
  await page.goto('/pos/resumen')
  const fila = page.locator('tr', { hasText: clienteNombre }).first()
  await expect(fila).toBeVisible()
  await fila.getByRole('button', { name: /Pagos/ }).click()

  const dialogo = page.getByRole('dialog')
  const aviso = dialogo.getByTestId('pedido-especial')
  await expect(aviso).toContainText('Pedido especial con seña')
  await expect(aviso).toContainText('llegada esperada')
  await expect(aviso).toContainText(`seña registrada ${gs(SENA)}`)
  await expect(aviso).toContainText(`saldo al entregar ${gs(SALDO)}`)
  await expect(dialogo.getByText('Seña', { exact: true }).first()).toBeVisible()
  await expect(dialogo.getByText('Pendiente', { exact: true }).locator('..')).toContainText(gs(SALDO))

  // Al entregar se cobra el saldo con el mismo camino de pagos.
  await dialogo.getByLabel('Cuenta de destino').selectOption({ label: 'Caja E2E · PYG · CASH' })
  await dialogo.getByLabel('Monto del pago').fill(String(SALDO))
  await dialogo.getByRole('button', { name: 'Registrar pago' }).click()
  await expect(dialogo.getByRole('status')).toContainText('Pago registrado')
  await expect(dialogo.getByText('Pendiente', { exact: true }).locator('..')).toContainText('Gs 0')

  // Backend: dos cobros confirmados (seña + saldo) y el pedido completado.
  const cerrado = await page.evaluate(
    async ({ api, orderId }) => {
      const orden = await (await fetch(`${api}/api/orders/${encodeURIComponent(orderId)}`, { credentials: 'include' })).json()
      return { status: orden.status, confirmados: (orden.payments || []).filter(payment => payment.status === 'CONFIRMED').map(payment => payment.amountPyg) }
    },
    { api: API, orderId: pedido.id },
  )
  expect(cerrado.status).toBe('COMPLETED')
  expect(cerrado.confirmados.sort((a, b) => a - b)).toEqual([SENA, SALDO])
})
