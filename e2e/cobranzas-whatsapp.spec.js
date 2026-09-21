// Cobranzas por WhatsApp (#81): la pantalla de cuotas muestra la mora, arma el
// mensaje con la plantilla de Cobranzas y registra el aviso (una vez por cuota)
// en la cronología del cliente y del pedido.

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

test.describe('cobranzas por WhatsApp', () => {
  test('recordar una cuota vencida desde la pantalla, con mora y auditoría', async ({ page }) => {
    await page.goto('/pos')
    const marca = Date.now()
    const telefono = `981${String(marca).slice(-6)}`

    const cliente = await api(page, '/api/customers', {
      method: 'POST',
      body: JSON.stringify({ name: `Cliente Cobranza ${marca}`, phone: telefono, countryCode: '+595' }),
    })
    expect(cliente.status).toBe(201)

    // Pedido a crédito sin cobro: dos cuotas, una vencida y otra por vencer.
    const pedido = await api(page, '/api/orders', {
      method: 'POST',
      body: JSON.stringify({
        orderNumber: `E2E-COBRO-${marca}`,
        customerId: cliente.body.id,
        items: [{ description: 'Equipo a crédito E2E', quantity: 1, unitPricePyg: 100000 }],
      }),
    })
    expect(pedido.status).toBe(201)
    const vencida = await api(page, '/api/payments', {
      method: 'POST',
      body: JSON.stringify({ orderId: pedido.body.id, method: 'CREDIT', status: 'PENDING', amountPyg: 40000, reference: 'Cuota 1/2', dueAt: new Date(Date.now() - 5 * 86400000).toISOString() }),
    })
    expect(vencida.status).toBe(201)
    const proxima = await api(page, '/api/payments', {
      method: 'POST',
      body: JSON.stringify({ orderId: pedido.body.id, method: 'CREDIT', status: 'PENDING', amountPyg: 40000, reference: 'Cuota 2/2', dueAt: new Date(Date.now() + 2 * 86400000).toISOString() }),
    })
    expect(proxima.status).toBe(201)

    // La pantalla no toca la red externa: se registra la URL que abriría.
    await page.addInitScript(() => {
      window.__waAbiertos = []
      const original = window.open
      window.open = (url, ...resto) => {
        window.__waAbiertos.push(String(url))
        return { closed: false, focus() {}, location: { href: String(url) } }
      }
      void original
    })
    await page.goto('/finanzas/cuotas')
    await expect(page.getByRole('heading', { name: 'Cobranzas por WhatsApp' })).toBeVisible()

    const fila = page.getByTestId('cuota-fila').filter({ hasText: `Cliente Cobranza ${marca}` }).first()
    await expect(fila).toBeVisible()
    await expect(fila.getByText('Vencida', { exact: false })).toBeVisible()
    await expect(fila.getByText('Gs 40.000', { exact: false }).first()).toBeVisible()
    // La cuota por vencer va en su propia sección.
    await expect(page.getByRole('heading', { name: /Próximas/ })).toBeVisible()

    // El mensaje sale de la plantilla de Cobranzas y nombra al cliente.
    await fila.getByRole('button', { name: 'Ver mensaje' }).click()
    const modal = page.getByRole('dialog', { name: new RegExp(`Mensaje para Cliente Cobranza ${marca}`) })
    await expect(modal).toBeVisible()
    await expect(modal.getByText(new RegExp(`Hola Cliente Cobranza ${marca}`))).toBeVisible()
    await expect(modal.getByText(new RegExp(`E2E-COBRO-${marca}`)).first()).toBeVisible()
    await expect(modal.getByText(/https:\/\/wa\.me\/595/)).toBeVisible()
    await modal.getByRole('button', { name: 'Cerrar' }).last().click()

    // Avisar: abre el enlace y registra el aviso.
    await fila.getByRole('button', { name: 'WhatsApp', exact: true }).click()
    await expect(page.getByText(/registrado y auditado/)).toBeVisible()
    await expect(fila.getByText(/Avisado/)).toBeVisible()
    const abiertos = await page.evaluate(() => window.__waAbiertos)
    expect(abiertos.length).toBeGreaterThan(0)
    expect(abiertos[0]).toContain(`https://wa.me/595${telefono}`)

    // Auditoría: el aviso queda en la cronología del cliente y del pedido.
    const timeline = await api(page, `/api/customers/${cliente.body.id}/timeline`)
    expect(timeline.status).toBe(200)
    expect((timeline.body?.events || []).some((event) => event.action === 'COLLECTION_WHATSAPP_REMINDED')).toBe(true)
    const historial = await api(page, `/api/orders/${pedido.body.id}/history`)
    expect(historial.status).toBe(200)
    expect((historial.body?.events || []).some((event) => event.action === 'ORDER_COLLECTION_WHATSAPP_REMINDED')).toBe(true)

    // Un segundo clic no vuelve a registrar: el aviso ya está hecho y el botón
    // ofrece reenviar explícitamente.
    await expect(fila.getByRole('button', { name: 'Reenviar WhatsApp' })).toBeVisible()
    await fila.getByRole('button', { name: 'Reenviar WhatsApp' }).click()
    await expect(fila.getByText(/Avisado/)).toBeVisible()
  })
})
