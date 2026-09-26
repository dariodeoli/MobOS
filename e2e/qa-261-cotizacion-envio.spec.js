// #261 — Envío de la cotización al cliente: la plantilla profesional del
// mensaje (WhatsApp) y el correo con el email registrado quedan registrados en
// la cronología del cliente. La UI del share sheet/PDF es del POS: acá se
// verifica el contrato de punta a punta (API + ficha).
import { test, expect } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'

const API = SEED.api
const SHOTS = process.env.MOBOS_CAPTURAS || 'test-results/QA-261-cotizacion-envio'

async function api(page, path, options = {}) {
  return page.evaluate(async ({ api, path, options }) => {
    const response = await fetch(`${api}${path}`, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...options })
    const body = await response.json().catch(() => null)
    return { status: response.status, body }
  }, { api: API, path, options })
}

test('la cotización se envía por WhatsApp y correo y queda en la cronología', async ({ page }) => {
  await page.goto('/clientes')
  const marca = Date.now().toString(36).toUpperCase()

  const cliente = await api(page, '/api/customers', {
    method: 'POST',
    body: JSON.stringify({ name: `Cliente Envío ${marca}`, phone: `0984${String(Date.now()).slice(-6)}`, email: `envio-${marca.toLowerCase()}@ejemplo.com` }),
  })
  expect(cliente.status, JSON.stringify(cliente.body)).toBe(201)

  const cotizacion = await api(page, '/api/quotes', {
    method: 'POST',
    body: JSON.stringify({
      customerId: cliente.body.id,
      customerName: cliente.body.name,
      validUntil: new Date(Date.now() + 7 * 86400000).toISOString(),
      items: [{ description: 'iPhone 15 · 128 GB', quantity: 1, unitPricePyg: 4850000 }],
    }),
  })
  expect(cotizacion.status, JSON.stringify(cotizacion.body)).toBe(201)

  // Vista previa del mensaje profesional (sin efectos).
  const previa = await api(page, `/api/quotes/${encodeURIComponent(cotizacion.body.id)}/message`)
  expect(previa.status, JSON.stringify(previa.body)).toBe(200)
  expect(previa.body.message).toContain(cotizacion.body.number)
  expect(previa.body.message).toContain('Total: Gs. 4.850.000')
  expect(previa.body.message).toContain(`/cotizacion/${cotizacion.body.publicToken}`)
  expect(previa.body.message).toContain(`Hola ${cliente.body.name}`)

  // WhatsApp: envío + estado enviado; correo: encolado al email del cliente.
  const whatsapp = await api(page, `/api/quotes/${encodeURIComponent(cotizacion.body.id)}/message`, { method: 'POST', body: JSON.stringify({ canal: 'WHATSAPP' }) })
  expect(whatsapp.status, JSON.stringify(whatsapp.body)).toBe(200)
  expect(whatsapp.body.status).toBe('SENT')
  expect(whatsapp.body.whatsappUrl).toContain('wa.me/595')
  const correo = await api(page, `/api/quotes/${encodeURIComponent(cotizacion.body.id)}/message`, { method: 'POST', body: JSON.stringify({ canal: 'EMAIL' }) })
  expect(correo.status, JSON.stringify(correo.body)).toBe(200)
  expect(correo.body.queued).toBe(true)
  expect(correo.body.to).toBe(cliente.body.email)

  // Cronología del cliente: los dos envíos, con canal y número.
  await page.goto(`/clientes?cliente=${encodeURIComponent(cliente.body.id)}`)
  const ficha = page.getByRole('dialog')
  await ficha.getByText('Saldo pendiente', { exact: false }).first().waitFor({ timeout: 20000 })
  await ficha.getByRole('tab', { name: /^Cronología/ }).click()
  await expect(ficha.getByText('Cotización enviada').first()).toBeVisible({ timeout: 20000 })
  await expect(ficha.getByText(/por WhatsApp/).first()).toBeVisible()
  await expect(ficha.getByText(new RegExp(`por correo a .*envio-${marca.toLowerCase()}@ejemplo\\.com`)).first()).toBeVisible()
  await expect(ficha.getByText(new RegExp(cotizacion.body.number)).first()).toBeVisible()
  // La cronología vive dentro del diálogo con scroll propio: se centra el
  // evento y se captura el diálogo para que la evidencia lo muestre.
  await ficha.getByText(/por correo a /).first().scrollIntoViewIfNeeded()
  await ficha.screenshot({ path: `${SHOTS}/01-cronologia-cotizacion-enviada.png` })
})
