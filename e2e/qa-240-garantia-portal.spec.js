// #240 §3/§4 — Seguimiento de la garantía en el portal: la cuenta del cliente
// abre la credencial del QR (cobertura y vencimiento) y muestra la etapa del
// taller cuando el caso derivó en una orden. También el recorrido demo.
import { test, expect } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'

const API = SEED.api
const SALIDA = 'docs/QA-240-garantia-portal'

async function api(page, path, options = {}) {
  return page.evaluate(async ({ api, path, options }) => {
    const response = await fetch(`${api}${path}`, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...options })
    const body = await response.json().catch(() => null)
    return { status: response.status, body }
  }, { api: API, path, options })
}

test('la garantía se abre desde el portal y muestra la etapa del taller', async ({ page }) => {
  await page.goto('/clientes')
  const marca = Date.now().toString(36).toUpperCase()
  const cliente = await api(page, '/api/customers', {
    method: 'POST',
    body: JSON.stringify({ name: `Cliente Garantía Portal ${marca}`, phone: `0982${String(Date.now()).slice(-6)}` }),
  })
  expect(cliente.status, JSON.stringify(cliente.body)).toBe(201)

  const serial = `GAR-PORTAL-${marca}`
  const garantia = await api(page, '/api/warranties', {
    method: 'POST',
    body: JSON.stringify({
      customerId: cliente.body.id,
      customerName: cliente.body.name,
      branchId: SEED.branchId,
      serial,
      description: 'iPhone 14 Pro',
      warrantyDays: 365,
      coverage: 'Fallas de fábrica del equipo\nBatería con salud por debajo del 80%',
      exclusions: 'Daños por golpes o líquidos',
    }),
  })
  expect(garantia.status, JSON.stringify(garantia.body)).toBe(201)
  expect(garantia.body.publicToken, 'La garantía devuelve su token público.').toBeTruthy()

  // Orden de taller que nace del caso (#224): comparte el serial de la garantía.
  const orden = await api(page, '/api/service-orders', {
    method: 'POST',
    body: JSON.stringify({ warrantyCaseId: garantia.body.id, customerId: cliente.body.id, customerName: cliente.body.name, device: 'iPhone 14 Pro', serial }),
  })
  expect(orden.status, JSON.stringify(orden.body)).toBe(201)

  // Portal nivel completo del cliente (por API, sin depender del modal).
  const portal = await api(page, `/api/customers/${encodeURIComponent(cliente.body.id)}/access-token`, {
    method: 'POST',
    body: JSON.stringify({ level: 'completo' }),
  })
  expect(portal.status, JSON.stringify(portal.body)).toBe(200)
  expect(portal.body.token).toBeTruthy()

  await page.goto(`/cuenta/${encodeURIComponent(portal.body.token)}`)
  await expect(page.getByText('Garantías activas')).toBeVisible({ timeout: 20000 })
  await expect(page.getByText('En el taller:')).toBeVisible()
  await expect(page.getByText('Recibido').first()).toBeVisible()
  await page.screenshot({ path: `${SALIDA}/01-portal-garantia.png`, fullPage: true })

  // La credencial pública se abre desde el portal: cobertura y vencimiento.
  await page.getByRole('link', { name: 'Ver garantía' }).first().click()
  await expect(page.getByText('Garantía oficial')).toBeVisible({ timeout: 20000 })
  await expect(page.getByText(/iPhone 14 Pro/).first()).toBeVisible()
  await expect(page.getByText(/días restantes|Garantía vencida/)).toBeVisible()
  await expect(page.getByText('Fallas de fábrica del equipo').first()).toBeVisible()
  await page.screenshot({ path: `${SALIDA}/02-credencial-garantia.png`, fullPage: true })
})

test('demo: la garantía se abre desde el portal con datos del navegador', async ({ browser }) => {
  const contexto = await browser.newContext({ viewport: { width: 1280, height: 960 } })
  const page = await contexto.newPage()

  // Portal demo (nivel completo): la garantía de Lucía con su credencial.
  await page.goto('/cuenta/demo-demo-cliente-lucia-completo')
  await expect(page.getByText('Garantías activas')).toBeVisible({ timeout: 20000 })
  const enlace = page.getByRole('link', { name: 'Ver garantía' }).first()
  await expect(enlace).toHaveAttribute('href', /\?demo=1/)
  await enlace.click()
  await expect(page.getByText('Garantía oficial')).toBeVisible({ timeout: 20000 })
  await expect(page.getByText(/iPhone 15/).first()).toBeVisible()
  await expect(page.getByText('Aurora Móviles')).toBeVisible()
  await expect(page.getByText(/días restantes/)).toBeVisible()
  await page.screenshot({ path: `${SALIDA}/03-demo-garantia.png`, fullPage: true })

  // La garantía de Fernando está en el taller: la etapa viaja al portal demo.
  await page.goto('/cuenta/demo-demo-cliente-fernando-completo')
  await expect(page.getByText('Garantías activas')).toBeVisible({ timeout: 20000 })
  await expect(page.getByText('En el taller:')).toBeVisible()
  await expect(page.getByText('Diagnóstico').first()).toBeVisible()
  await page.screenshot({ path: `${SALIDA}/04-demo-garantia-taller.png`, fullPage: true })
  await contexto.close()
})
