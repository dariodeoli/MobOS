// Campañas de recompra (#82): segmento de inactivos, opt-in respetado,
// campaña registrada con enlaces wa.me y sin repetir al ya contactado.

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

test.describe('campañas de recompra', () => {
  test('segmentar, enviar y no repetir al cliente ya contactado', async ({ page }) => {
    await page.goto('/clientes')
    const marca = Date.now()
    const base = String(marca).slice(-4)

    const conOptIn = await api(page, '/api/customers', {
      method: 'POST',
      body: JSON.stringify({ name: `Cliente Recompra ${marca}`, phone: `98110${base}1`, countryCode: '+595', acceptsWhatsappMarketing: true }),
    })
    const sinOptIn = await api(page, '/api/customers', {
      method: 'POST',
      body: JSON.stringify({ name: `Cliente Sin Recompra ${marca}`, phone: `98110${base}2`, countryCode: '+595', acceptsWhatsappMarketing: false }),
    })
    expect(conOptIn.status).toBe(201)
    expect(sinOptIn.status).toBe(201)
    for (const [indice, cliente] of [conOptIn, sinOptIn].entries()) {
      const pedido = await api(page, '/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          orderNumber: `E2E-RECOMPRA-${marca}-${indice}`,
          customerId: cliente.body.id,
          items: [{ description: 'Accesorio E2E recompra', quantity: 1, unitPricePyg: 25000 }],
          payment: { method: 'CASH', amountPyg: 25000 },
        }),
      })
      expect(pedido.status).toBe(201)
    }

    await page.goto('/clientes')
    await expect(page.getByRole('heading', { name: 'Clientes' })).toBeVisible()
    await page.getByRole('button', { name: 'Campañas' }).click()
    const panel = page.getByTestId('marketing-panel')
    await expect(panel).toBeVisible()

    // Segmento inactivos con 0 días: entra cualquier cliente con compras.
    await panel.getByLabel('Días sin comprar').fill('0')
    await panel.getByRole('button', { name: 'Buscar clientes' }).click()
    const elegible = panel.getByTestId('marketing-cliente').filter({ hasText: `Cliente Recompra ${marca}` }).first()
    const bloqueado = panel.getByTestId('marketing-cliente').filter({ hasText: `Cliente Sin Recompra ${marca}` }).first()
    await expect(elegible).toBeVisible()
    await expect(bloqueado).toBeVisible()
    // El opt-in se respeta: el cliente sin consentimiento queda marcado y sin
    // casilla seleccionable.
    await expect(bloqueado.getByText('Sin consentimiento de WhatsApp')).toBeVisible()
    await expect(bloqueado.locator('input[type="checkbox"]')).toBeDisabled()
    await expect(elegible.locator('input[type="checkbox"]')).toBeChecked()

    // Campaña: se registra y genera el enlace wa.me con el mensaje renderizado.
    // Solo se envía a los seleccionados (el que no tiene opt-in ni siquiera se
    // puede tildar), por eso no hay omitidos en este envío.
    await panel.getByRole('button', { name: 'Registrar campaña y generar enlaces' }).click()
    await expect(panel.getByText(/Campaña «.*» registrada: 1 mensaje\(s\) listos, 0 omitido\(s\)/)).toBeVisible()
    const destinatario = panel.getByTestId('marketing-destinatario').filter({ hasText: `Cliente Recompra ${marca}` }).first()
    await expect(destinatario).toBeVisible()
    const enlace = destinatario.getByRole('link', { name: 'Abrir WhatsApp' })
    await expect(enlace).toHaveAttribute('href', /https:\/\/wa\.me\/595/)
    await expect(destinatario.getByRole('button', { name: 'Copiar enlace' })).toBeVisible()
    await expect(panel.getByText(/Campañas recientes/)).toBeVisible()

    // No repetir: al volver a segmentar, el contactado queda fuera por la
    // ventana de enfriamiento.
    await panel.getByRole('button', { name: 'Buscar clientes' }).click()
    const contactado = panel.getByTestId('marketing-cliente').filter({ hasText: `Cliente Recompra ${marca}` }).first()
    await expect(contactado.getByText('Contactado hace poco')).toBeVisible()
    await expect(contactado.locator('input[type="checkbox"]')).toBeDisabled()
    // Y la campaña anterior sigue listada para auditoría.
    await expect(panel.getByText(/Inactivos \d/).first()).toBeVisible()

    // Opt-in a nivel API: aunque se pida el cliente sin consentimiento, el
    // servidor no le genera enlace y lo informa como omitido.
    const plantillas = await api(page, '/api/message-templates?category=CUSTOMERS')
    const templateKey = (plantillas.body || []).find((item) => item.isActive !== false)?.key
    expect(templateKey).toBeTruthy()
    const forzado = await api(page, '/api/marketing/campaigns', {
      method: 'POST',
      body: JSON.stringify({ segment: 'INACTIVE', days: 0, cooldownDays: 0, templateKey, customerIds: [conOptIn.body.id, sinOptIn.body.id] }),
    })
    expect(forzado.status).toBe(201)
    expect(forzado.body.recipients).toHaveLength(1)
    expect(forzado.body.recipients[0].customerId).toBe(conOptIn.body.id)
    expect(forzado.body.skipped).toHaveLength(1)
    expect(forzado.body.skipped[0].reason).toBe('sin_opt_in')
  })
})
