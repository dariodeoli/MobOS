// #280 · Gift cards reales: emisión con código desde el POS, saldo, canje en el
// cobro, historial por tarjeta y auditoría. Incluye la paridad de la demo.
import { test, expect } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'
import { cerrarGuiaDemo } from './helpers/demo.js'

const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`
const CAPTURAS = process.env.MOBOS_CAPTURAS || ''
const captura = (page, nombre) => (CAPTURAS ? page.screenshot({ path: `${CAPTURAS}/${nombre}.jpg`, type: 'jpeg', quality: 74, fullPage: true }) : Promise.resolve())

async function api(page, path, options = {}) {
  return page.evaluate(async ({ api, path, options }) => {
    const response = await fetch(`${api}${path}`, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...options })
    const body = await response.json().catch(() => null)
    return { status: response.status, body }
  }, { api: API, path, options })
}

// Emite una gift card desde el modal del POS y devuelve el código.
async function emitirDesdePos(page, monto) {
  await page.getByRole('button', { name: 'Gift cards' }).click()
  const modal = page.getByTestId('gift-cards-modal')
  await expect(modal).toBeVisible()
  await page.getByLabel('Monto (₲)').fill(String(monto))
  // La cuenta de cobro es opcional: en el arnés se elige la de prueba; en la
  // demo se usa la primera disponible (los nombres difieren).
  const cuenta = page.locator('#gc-cuenta')
  if (await cuenta.count()) {
    const opciones = await cuenta.locator('option').evaluateAll((nodes) => nodes.map((node) => ({ label: node.textContent || '', value: node.value })))
    const elegida = opciones.find((opcion) => /Caja E2E/.test(opcion.label)) || (opciones.length > 1 ? opciones[1] : null)
    if (elegida) await cuenta.selectOption(elegida.value)
  }
  await page.getByRole('button', { name: 'Emitir gift card' }).click()
  const codigo = page.getByTestId('gift-card-codigo')
  await expect(codigo).toBeVisible()
  return codigo.innerText()
}

test('gift cards: emisión en el POS, canje en el cobro, saldo e historial (#280)', async ({ page }) => {
  const marca = Date.now().toString(36)
  const cliente = `Cliente gift ${marca}`
  const emitido = 100000
  const venta = SEED.products.cable.pricePyg

  await page.goto('/pos')
  await expect(page.getByRole('heading', { name: /^(POS|Nueva venta)$/, level: 1 })).toBeVisible()
  await page.getByLabel('Nombre, teléfono, CI o RUC del cliente').fill(cliente)

  // 1) Emisión: el código se muestra una sola vez y la tarjeta queda en la lista.
  const codigo = await emitirDesdePos(page, emitido)
  expect(codigo).toMatch(/^GC-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/)
  await captura(page, 'gift-cards-emision')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('gift-cards-modal')).toHaveCount(0)

  // 2) Canje en el cobro: consulta de saldo y monto propuesto por lo pendiente.
  await page.getByPlaceholder('Buscar producto…').fill('Cable')
  await page.getByRole('button', { name: new RegExp(SEED.products.cable.name) }).click()
  await expect(page.getByText('Productos de esta venta')).toBeVisible()
  await page.getByRole('button', { name: '+ Canjear gift card' }).click()
  await page.getByLabel(/Código de gift card/).fill(codigo)
  await page.getByRole('button', { name: 'Consultar saldo' }).click()
  await expect(page.getByText(/Saldo disponible: Gs 100\.000/)).toBeVisible()
  await expect(page.getByLabel(/Monto a canjear de la gift card/)).toHaveValue('45.000')
  await captura(page, 'gift-cards-cobro')
  await page.getByRole('button', { name: /^(Confirmar venta|Crear pedido)/ }).click()
  await expect(page).toHaveURL(/\/pedidos\/[^/?#]+$/, { timeout: 20_000 })

  // 3) El pago quedó como gift card y el saldo descontado.
  const orden = await page.evaluate(async ({ api, cliente }) => {
    const response = await fetch(`${api}/api/orders`, { credentials: 'include' })
    if (!response.ok) return null
    const rows = await response.json()
    return rows.find((row) => row.customer?.name === cliente) || null
  }, { api: API, cliente })
  expect(orden?.payments?.[0]?.method).toBe('GIFT_CARD')
  expect(orden?.payments?.[0]?.reference).toBe(`GC ••${codigo.slice(-4)}`)
  const consulta = await api(page, `/api/gift-cards/lookup?code=${encodeURIComponent(codigo)}`)
  expect(consulta.status).toBe(200)
  expect(Number(consulta.body.balancePyg)).toBe(emitido - venta)
  expect(consulta.body.status).toBe('ACTIVE')

  // 4) Historial en el POS: emisión y canje con el pedido y el saldo resultante.
  await page.goto('/pos')
  await page.getByRole('button', { name: 'Gift cards' }).click()
  const fila = page.getByTestId('gift-card-fila').filter({ hasText: codigo.slice(-4) }).first()
  await expect(fila).toContainText('Gs 55.000')
  await fila.getByRole('button').first().click()
  const historial = page.getByTestId('gift-card-historial')
  await expect(historial).toContainText('Emitida')
  await expect(historial).toContainText('Canjeada')
  await expect(historial).toContainText(orden.orderNumber)
  await captura(page, 'gift-cards-historial')

  // 5) Auditoría: el canje queda con su rastro.
  const auditoria = await api(page, '/api/audit?action=GIFT_CARD_REDEEMED&limit=50')
  expect((auditoria.body || []).some((fila) => fila.entityId === consulta.body.id)).toBe(true)
  await page.keyboard.press('Escape')
})

test('demo: la gift card se emite y se canjea sin tocar el API (#280)', async ({ page }) => {
  const llamadas = []
  page.on('request', (request) => { if (request.url().includes('/api/gift-cards')) llamadas.push(request.url()) })

  await page.goto('/demo')
  await page.getByRole('button', { name: /Entrar como Vendedor/ }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 30_000 })
  await cerrarGuiaDemo(page)
  await page.goto('/pos')
  await expect(page.getByRole('heading', { name: /^(POS|Nueva venta)$/, level: 1 })).toBeVisible()
  await cerrarGuiaDemo(page)

  // Producto del catálogo demo con el precio exacto de la gift card emitida.
  const productoDemo = 'Funda Silicona Negra'
  const precioDemo = 150000
  const codigo = await emitirDesdePos(page, precioDemo)
  expect(codigo).toMatch(/^GC-/)
  await captura(page, 'gift-cards-demo-emision')
  await page.keyboard.press('Escape')

  await page.getByPlaceholder('Buscar producto…').fill(productoDemo)
  await page.getByRole('button', { name: new RegExp(productoDemo) }).first().click()
  await expect(page.getByText('Productos de esta venta')).toBeVisible()
  await page.getByRole('button', { name: '+ Canjear gift card' }).click()
  await page.getByLabel(/Código de gift card/).fill(codigo)
  await page.getByRole('button', { name: 'Consultar saldo' }).click()
  await expect(page.getByText(/Saldo disponible: Gs 150\.000/)).toBeVisible()
  await page.getByRole('button', { name: /^(Confirmar venta|Crear pedido)/ }).click()
  await expect(page).toHaveURL(/\/pedidos\//, { timeout: 15_000 })

  // La tarjeta queda agotada con su historial, todo local (sin llamadas al API).
  // Se vuelve al POS por navegación SPA: la demo vive en memoria y un reload la reinicia.
  await page.locator('aside nav button[aria-label="POS"]').click()
  await expect(page.getByRole('button', { name: 'Gift cards' })).toBeVisible()
  await page.getByRole('button', { name: 'Gift cards' }).click()
  const fila = page.getByTestId('gift-card-fila').filter({ hasText: codigo.slice(-4) }).first()
  await expect(fila).toContainText('Agotada')
  await fila.getByRole('button').first().click()
  await expect(page.getByTestId('gift-card-historial')).toContainText('Canjeada')
  await captura(page, 'gift-cards-demo-historial')
  expect(llamadas, `llamadas al API de gift cards en la demo: ${llamadas.join(', ')}`).toEqual([])
})
