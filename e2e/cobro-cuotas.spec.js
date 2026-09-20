// Cobro de cuotas de un plan de crédito (#99): la cuota se cobra sobre sí
// misma desde la pantalla de Cobranzas, baja la deuda del pedido en el mismo
// movimiento y deja de reclamarse. El plan completo cierra el pedido.

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

test('cobrar una cuota la salda, baja la deuda y deja de reclamarla', async ({ page }) => {
  // Origen de la app: la sesión de administración viaja en la cookie, así que
  // las altas por API se hacen con la página ya cargada.
  await page.goto('/finanzas/cuotas')
  const marca = Date.now()
  const cliente = await api(page, '/api/customers', { method: 'POST', body: JSON.stringify({ name: `Cliente Cuota ${marca}` }) })
  expect(cliente.status).toBe(201)

  // Pedido a crédito de 120.000 con un plan de 3 cuotas de 40.000. La primera
  // vence dentro de la ventana de Cobranzas: se cobra entrando desde ahí y el
  // pedido no está en el caché local del día (lo trae el API).
  const pedido = await api(page, '/api/orders', {
    method: 'POST',
    body: JSON.stringify({
      orderNumber: `E2E-CUOTA-${marca}`,
      customerId: cliente.body.id,
      items: [{ description: 'Equipo en cuotas E2E', quantity: 1, unitPricePyg: 120000 }],
    }),
  })
  expect(pedido.status).toBe(201)
  const plan = await api(page, `/api/orders/${encodeURIComponent(pedido.body.id)}/installments`, {
    method: 'POST',
    body: JSON.stringify({ count: 3, firstDueAt: new Date(Date.now() + 2 * 86400000).toISOString() }),
  })
  expect(plan.status).toBe(201)
  expect(plan.body.payments.length).toBe(3)
  const cuotas = plan.body.payments

  await page.goto('/finanzas/cuotas')
  await expect(page.getByRole('heading', { name: 'Cobranzas por WhatsApp' })).toBeVisible()
  const fila = page.getByTestId('cuota-fila').filter({ hasText: `Cliente Cuota ${marca}` }).filter({ hasText: cuotas[0].reference })
  await expect(fila).toBeVisible()
  await expect(fila.getByText('Gs 40.000', { exact: false }).first()).toBeVisible()
  await fila.getByRole('button', { name: 'Abrir pedido' }).click()
  const modal = page.getByRole('dialog', { name: new RegExp(`Pagos · E2E-CUOTA-${marca}`) })
  await expect(modal).toBeVisible()
  await expect(modal.getByText('Gs 120.000').first()).toBeVisible()

  // Cobrar una cuota: el monto queda fijado por la cuota misma y el cobro se
  // registra sobre ella (no nace un pago paralelo).
  const cobrar = async () => {
    await modal.getByRole('button', { name: 'Cobrar cuota' }).first().click()
    const form = page.locator('form').filter({ has: page.getByTestId('cuota-en-cobro') })
    await expect(form.getByTestId('cuota-en-cobro')).toContainText('Gs 40.000')
    await form.getByLabel('Método').selectOption('CASH')
    await form.getByRole('button', { name: 'Cobrar cuota' }).click()
    await expect(page.getByText('Cuota cobrada y conciliada: la deuda bajó y ya no se reclama.')).toBeVisible()
  }
  await cobrar()
  // La deuda del pedido bajó en el mismo movimiento.
  await expect(modal.getByText('Gs 80.000').first()).toBeVisible()
  let cobranzas = await api(page, '/api/collections/reminders')
  expect((cobranzas.body?.rows || []).some((row) => row.id === cuotas[0].id)).toBe(false)

  // Saldar el resto del plan desde el mismo listado de cuotas del pedido.
  await cobrar()
  await expect(modal.getByText('Gs 40.000').first()).toBeVisible()
  await cobrar()
  await expect(modal.getByText('Gs 0', { exact: true }).first()).toBeVisible()

  const detalle = await api(page, `/api/orders/${encodeURIComponent(pedido.body.id)}`)
  expect(detalle.status).toBe(200)
  expect(detalle.body.status).toBe('COMPLETED')
  // Un solo movimiento por cuota: no nacieron pagos paralelos.
  expect(detalle.body.payments.length).toBe(3)
  expect(detalle.body.payments.every((pago) => pago.status === 'CONFIRMED' && pago.method === 'CASH')).toBe(true)

  // La cuota se ve en la cronología del pedido, ya confirmada.
  const historial = await api(page, `/api/orders/${encodeURIComponent(pedido.body.id)}/history`)
  const pagos = (historial.body?.events || []).filter((event) => event.type === 'payment' && event.payment.status === 'CONFIRMED')
  expect(pagos.length).toBe(3)

  // Cobranzas ya no reclama nada de este cliente.
  await page.keyboard.press('Escape')
  await page.goto('/finanzas/cuotas')
  await expect(page.getByTestId('cuota-fila').filter({ hasText: `Cliente Cuota ${marca}` })).toHaveCount(0)
  cobranzas = await api(page, '/api/collections/reminders')
  expect((cobranzas.body?.rows || []).some((row) => row.customerName === `Cliente Cuota ${marca}`)).toBe(false)
})
