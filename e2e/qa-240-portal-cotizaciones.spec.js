// #240 → portal — Cotizaciones en la cuenta del cliente: la tienda comparte
// una propuesta y el cliente la ve con su validez, su estado y el enlace para
// aceptarla; si está por vencer, aparece como aviso accionable. Cuenta real del
// harness + demo (cuenta y página pública).
import { test, expect } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'

const API = SEED.api
const SHOTS = process.env.MOBOS_CAPTURAS || 'test-results/QA-240-portal-cotizaciones'

async function api(page, path, options = {}) {
  return page.evaluate(async ({ api, path, options }) => {
    const response = await fetch(`${api}${path}`, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...options })
    const body = await response.json().catch(() => null)
    return { status: response.status, body }
  }, { api: API, path, options })
}

test('la cuenta muestra la cotización compartida con su validez y enlace', async ({ page }) => {
  await page.goto('/clientes')
  const marca = Date.now().toString(36).toUpperCase()

  const cliente = await api(page, '/api/customers', {
    method: 'POST',
    body: JSON.stringify({ name: `Cliente Cotización ${marca}`, phone: `0985${String(Date.now()).slice(-6)}` }),
  })
  expect(cliente.status, JSON.stringify(cliente.body)).toBe(201)

  // La tienda arma la cotización y la envía: vence en 2 días.
  const cotizacion = await api(page, '/api/quotes', {
    method: 'POST',
    body: JSON.stringify({
      customerId: cliente.body.id,
      customerName: cliente.body.name,
      validUntil: new Date(Date.now() + 2 * 86400000).toISOString(),
      items: [{ description: 'iPhone 15 · 128 GB', quantity: 1, unitPricePyg: 4850000 }],
    }),
  })
  expect(cotizacion.status, JSON.stringify(cotizacion.body)).toBe(201)
  const enviada = await api(page, '/api/quotes', {
    method: 'PATCH',
    body: JSON.stringify({ id: cotizacion.body.id, status: 'SENT' }),
  })
  expect(enviada.status, JSON.stringify(enviada.body)).toBe(200)

  const portal = await api(page, `/api/customers/${encodeURIComponent(cliente.body.id)}/access-token`, {
    method: 'POST',
    body: JSON.stringify({ level: 'rapido' }),
  })
  expect(portal.status, JSON.stringify(portal.body)).toBe(200)
  expect(portal.body.token).toBeTruthy()

  await page.goto(`/cuenta/${encodeURIComponent(portal.body.token)}`)

  // Sección: número, validez, total, estado y enlace a la página pública.
  const seccion = page.getByTestId('portal-cotizaciones')
  await expect(seccion).toBeVisible({ timeout: 20000 })
  await expect(seccion.getByText(cotizacion.body.number)).toBeVisible()
  await expect(seccion.getByText(/Vence en 2 días/)).toBeVisible()
  await expect(seccion.getByText('Pendiente de confirmar')).toBeVisible()
  await expect(seccion.getByText(/4\.850\.000/)).toBeVisible()
  await expect(seccion.getByRole('link', { name: /Ver cotización/ })).toHaveAttribute('href', `/cotizacion/${cotizacion.body.publicToken}`)

  // Aviso accionable: cotización por vencer con atajo a su sección.
  const avisos = page.getByTestId('portal-avisos')
  await expect(avisos).toBeVisible()
  await expect(avisos.getByText(new RegExp(`Tu cotización ${cotizacion.body.number} vence en 2 días`))).toBeVisible()
  await expect(avisos.getByRole('link', { name: new RegExp(`Tu cotización ${cotizacion.body.number}`) })).toHaveAttribute('href', '#cotizaciones')
  await page.screenshot({ path: `${SHOTS}/01-cuenta-cotizacion.png`, fullPage: true })
})

test('demo: la cuenta de Lucía muestra su cotización y la página abre en demo', async ({ browser }) => {
  const contexto = await browser.newContext({ viewport: { width: 1280, height: 1100 } })
  const page = await contexto.newPage()

  await page.goto('/cuenta/demo-demo-cliente-lucia-rapido')
  const seccion = page.getByTestId('portal-cotizaciones')
  await expect(seccion).toBeVisible({ timeout: 20000 })
  await expect(seccion.getByText('COT-#0018')).toBeVisible()
  await expect(seccion.getByText(/Vence en 2 días/)).toBeVisible()
  await expect(seccion.getByText(/4\.850\.000/)).toBeVisible()
  await expect(seccion.getByRole('link', { name: /Ver cotización/ })).toHaveAttribute('href', '/cotizacion/demo-cot-lucia?demo=1')
  const avisos = page.getByTestId('portal-avisos')
  await expect(avisos.getByText(/Tu cotización COT-#0018 vence en 2 días/)).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/02-demo-cuenta-cotizacion.png`, fullPage: true })

  // El enlace abre la página pública de la cotización con los datos demo.
  await seccion.getByRole('link', { name: /Ver cotización/ }).click()
  await expect(page).toHaveURL(/\/cotizacion\/demo-cot-lucia\?demo=1/)
  await expect(page.getByRole('heading', { name: 'COT-#0018' })).toBeVisible()
  await expect(page.getByText('iPhone 15 · 128 GB')).toBeVisible()
  await expect(page.getByText(/4\.850\.000/).first()).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/03-demo-cotizacion-publica.png`, fullPage: true })

  await contexto.close()
})
