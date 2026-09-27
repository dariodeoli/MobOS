// #279 A5 — Variante agotada → alternativas: el comprador propone (versiones),
// el vendedor envía al cliente y el cliente aprueba con OTP por un enlace
// público. La necesidad original se libera recién al aceptar.
import { test, expect } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'

const SHOTS = process.env.MOBOS_CAPTURAS || 'test-results/QA-279-alternativas'

async function api(page, path, options = {}) {
  return page.evaluate(async ({ api, path, options }) => {
    const response = await fetch(`${api}${path}`, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...options })
    return { status: response.status, body: await response.json().catch(() => null) }
  }, { api: SEED.api, path, options })
}

test('variante agotada: proponer, enviar y aprobar con OTP libera la necesidad', async ({ page, browser }) => {
  await page.goto('/compras')
  const marca = Date.now().toString(36).toUpperCase()
  const producto = await api(page, '/api/products', { method: 'POST', body: JSON.stringify({ sku: `A5E-${marca}`, name: `Equipo A5 ${marca}`, pricePyg: 1800000, stock: 1 }) })
  expect(producto.status, JSON.stringify(producto.body)).toBe(201)
  const necesidad = await api(page, '/api/supply/needs', { method: 'POST', body: JSON.stringify({ productId: producto.body.id, quantity: 1, priority: 'NORMAL', notes: `A5 e2e ${marca}` }) })
  expect(necesidad.status, JSON.stringify(necesidad.body)).toBe(201)
  const needId = necesidad.body.id || necesidad.body.need?.id
  const propuesta = await api(page, `/api/supply/needs/${encodeURIComponent(needId)}/alternatives`, { method: 'POST', body: JSON.stringify({ reason: 'Se agotó el color azul', optionSummary: 'Negro 256 GB', priceDeltaPyg: 90000, newEta: new Date(Date.now() + 4 * 86400000).toISOString() }) })
  expect(propuesta.status, JSON.stringify(propuesta.body)).toBe(201)
  const envio = await api(page, `/api/supply/alternatives/${encodeURIComponent(propuesta.body.alternative.id)}/decision`, { method: 'POST', body: JSON.stringify({ decision: 'ENVIAR_CLIENTE' }) })
  expect(envio.status, JSON.stringify(envio.body)).toBe(200)
  expect(String(envio.body.otp || '')).toMatch(/^\d{6}$/)

  // El cliente abre el enlace sin sesión y aprueba con el código.
  const cliente = await browser.newContext()
  const vista = await cliente.newPage()
  await vista.goto(new URL(envio.body.link, page.url()).href)
  await expect(vista.getByTestId('alternativa-publica')).toBeVisible({ timeout: 20000 })
  await expect(vista.getByText('Negro 256 GB')).toBeVisible()
  await expect(vista.getByText(/Diferencia/)).toBeVisible()
  await vista.screenshot({ path: `${SHOTS}/01-propuesta-cliente.png` })
  await vista.getByLabel('Código de confirmación').fill('000001')
  await vista.getByTestId('alternativa-aceptar').click()
  await expect(vista.getByText(/Código incorrecto/)).toBeVisible({ timeout: 15000 })
  await vista.getByLabel('Código de confirmación').fill(envio.body.otp)
  await vista.getByTestId('alternativa-aceptar').click()
  await expect(vista.getByText(/Confirmaste la alternativa/)).toBeVisible({ timeout: 15000 })
  await vista.screenshot({ path: `${SHOTS}/02-aprobada.png` })

  // La necesidad original quedó liberada recién con la aceptación.
  const estado = await api(page, `/api/supply/needs/${encodeURIComponent(needId)}/alternatives`)
  expect(estado.body.need.status).toBe('COMPRADA')
  await cliente.close()
})
