// #240 → portal — Avisos de la cuenta: lo accionable (pagos por vencer o
// vencidos, retiros listos, pedidos en camino y garantías por vencer) con un
// atajo a la sección que lo explica. Cuenta real del harness + demo.
import { test, expect } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'

const API = SEED.api
const SALIDA = 'test-results/QA-240-portal-avisos'

async function api(page, path, options = {}) {
  return page.evaluate(async ({ api, path, options }) => {
    const response = await fetch(`${api}${path}`, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...options })
    const body = await response.json().catch(() => null)
    return { status: response.status, body }
  }, { api: API, path, options })
}

test('la cuenta avisa el pago por vencer y el equipo listo para retirar', async ({ page }) => {
  await page.goto('/clientes')
  const marca = Date.now().toString(36).toUpperCase()

  const productos = await api(page, '/api/products')
  const lista = Array.isArray(productos.body) ? productos.body : productos.body?.rows || []
  const producto = lista.find((row) => row.stock > 0) || lista[0]
  expect(producto?.id, 'el harness tiene un producto con stock').toBeTruthy()

  const cliente = await api(page, '/api/customers', {
    method: 'POST',
    body: JSON.stringify({ name: `Cliente Avisos ${marca}`, phone: `0984${String(Date.now()).slice(-6)}`, creditLimitPyg: 2000000, creditDays: 30 }),
  })
  expect(cliente.status, JSON.stringify(cliente.body)).toBe(201)

  // Pedido a crédito con pago parcial: queda un saldo que vence en 5 días.
  const pedido = await api(page, '/api/orders', {
    method: 'POST',
    body: JSON.stringify({
      orderNumber: `QA-AVISO-${marca}`,
      customerId: cliente.body.id,
      creditDays: 5,
      items: [{ productId: producto.id, description: producto.name || producto.nombre, quantity: 1, unitPricePyg: 100000 }],
      payment: { method: 'CASH', amountPyg: 40000 },
    }),
  })
  expect(pedido.status, JSON.stringify(pedido.body)).toBe(201)

  // Equipo en el taller ya listo para retirar.
  const servicio = await api(page, '/api/service-orders', {
    method: 'POST',
    body: JSON.stringify({ customerId: cliente.body.id, customerName: cliente.body.name, device: `iPhone 13 ${marca}`, serial: `AV-${marca}`, serviceName: 'Cambio de batería', status: 'LISTO' }),
  })
  expect(servicio.status, JSON.stringify(servicio.body)).toBe(201)

  const portal = await api(page, `/api/customers/${encodeURIComponent(cliente.body.id)}/access-token`, {
    method: 'POST',
    body: JSON.stringify({ level: 'rapido' }),
  })
  expect(portal.status, JSON.stringify(portal.body)).toBe(200)
  expect(portal.body.token).toBeTruthy()

  await page.goto(`/cuenta/${encodeURIComponent(portal.body.token)}`)
  const avisos = page.getByTestId('portal-avisos')
  await expect(avisos).toBeVisible({ timeout: 20000 })
  await expect(avisos.getByText(/Tu pago vence en 5 días/)).toBeVisible()
  await expect(avisos.getByText(new RegExp(`está listo para retirar`))).toBeVisible()
  // El aviso lleva a la sección que lo explica.
  await expect(avisos.getByRole('link', { name: /Tu pago vence en 5 días/ })).toHaveAttribute('href', '#vencimientos')
  await page.screenshot({ path: `${SALIDA}/01-cuenta-avisos.png`, fullPage: true })
})

test('demo: los avisos se arman con los datos del navegador', async ({ browser }) => {
  const contexto = await browser.newContext({ viewport: { width: 1280, height: 1100 } })
  const page = await contexto.newPage()

  // Lucía: pago por vencer + pedido en camino.
  await page.goto('/cuenta/demo-demo-cliente-lucia-rapido')
  const avisosLucia = page.getByTestId('portal-avisos')
  await expect(avisosLucia).toBeVisible({ timeout: 20000 })
  await expect(avisosLucia.getByText(/Tu pago vence en 6 días/)).toBeVisible()
  await expect(avisosLucia.getByText(/MOB-#0008 está en camino/)).toBeVisible()
  await page.screenshot({ path: `${SALIDA}/02-demo-avisos-lucia.png`, fullPage: true })

  // María: garantía por vencer (nivel completo).
  await page.goto('/cuenta/demo-demo-cliente-maria-completo')
  const avisosMaria = page.getByTestId('portal-avisos')
  await expect(avisosMaria).toBeVisible({ timeout: 20000 })
  await expect(avisosMaria.getByText(/Tu garantía vence en 12 días/)).toBeVisible()
  await page.screenshot({ path: `${SALIDA}/03-demo-aviso-garantia.png`, fullPage: true })

  // Carlos: pedido listo para retirar en el local.
  await page.goto('/cuenta/demo-demo-cliente-carlos-rapido')
  await expect(page.getByTestId('portal-avisos').getByText(/MOB-#0004 está listo para retirar/)).toBeVisible({ timeout: 20000 })
  await page.screenshot({ path: `${SALIDA}/04-demo-aviso-retiro.png`, fullPage: true })
  await contexto.close()
})
