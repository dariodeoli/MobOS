// API real del arnés (sesión de administración): lote de valores de toma idempotente y con permisos, y
// cotización con equipo que entrega el cliente (valor tomado del servidor, vista pública y conversión).
import { test, expect } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'

const API = SEED.api

async function api(page, path, options = {}) {
  return page.evaluate(async ({ api, path, options }) => {
    const response = await fetch(`${api}${path}`, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...options })
    const body = await response.json().catch(() => null)
    return { status: response.status, body }
  }, { api: API, path, options })
}

async function contextoVendedor(browser) {
  const ctx = await browser.newContext()
  const login = await ctx.request.post(`${API}/api/auth/login`, { data: { email: SEED.company.email, password: SEED.company.password, deviceId: SEED.company.deviceId } })
  const setCookies = (await login.headersArray()).filter((h) => h.name.toLowerCase() === 'set-cookie').map((h) => h.value)
  const company = setCookies.map((c) => c.match(/mobos_company_session=([^;]*)/)?.[1]).find(Boolean)
  const sellers = (await login.json()).sellers || []
  const seller = sellers.find((s) => s.name === SEED.sellers[0].name) || sellers[0]
  await ctx.request.post(`${API}/api/auth/pin`, { headers: { Authorization: `Bearer ${company}` }, data: { sellerId: seller?.id, pin: SEED.sellers[0].pin } })
  return ctx
}

test('API: lote de valores idempotente, con permisos, y cotización con equipo (valor del servidor, público y conversión)', async ({ page, browser }) => {
  await page.goto('/clientes')
  const lote = [
    { model: 'iPhone 13', storage: '128 gb', condition: 'USED', baseValuePyg: 2100000, maxValuePyg: 2400000 },
    { model: 'iPhone 13', storage: '256GB', condition: 'USED', baseValuePyg: 2500000 },
  ]
  const primero = await api(page, '/api/device-valuations/batch', { method: 'POST', body: JSON.stringify({ rows: lote }) })
  expect(primero.status, JSON.stringify(primero.body)).toBe(200)
  expect(primero.body.created + primero.body.updated + primero.body.unchanged).toBe(2)
  // Repetir el mismo lote no cambia nada.
  const segundo = await api(page, '/api/device-valuations/batch', { method: 'POST', body: JSON.stringify({ rows: lote }) })
  expect(segundo.body).toMatchObject({ created: 0, updated: 0, unchanged: 2 })
  // Una capacidad que el modelo no trae rechaza todo el lote.
  const malo = await api(page, '/api/device-valuations/batch', { method: 'POST', body: JSON.stringify({ rows: [lote[0], { model: 'iPhone 13', storage: '2TB', condition: 'USED', baseValuePyg: 1 }] }) })
  expect(malo.status).toBe(400)
  const alta = await api(page, '/api/device-valuations', { method: 'POST', body: JSON.stringify({ model: 'iPhone 13', storage: '2TB', condition: 'NEW', baseValuePyg: 1000000 }) })
  expect(alta.status).toBe(400)

  // Un vendedor no edita valores de toma.
  const vendedor = await contextoVendedor(browser)
  const paginaVendedor = await vendedor.newPage()
  await paginaVendedor.goto('/clientes')
  const sinPermiso = await api(paginaVendedor, '/api/device-valuations/batch', { method: 'POST', body: JSON.stringify({ rows: lote }) })
  expect(sinPermiso.status, JSON.stringify(sinPermiso.body)).toBe(403)

  // Cotización con equipo: el servidor toma el valor de su tabla (ignora el monto del cliente).
  const cot = await api(page, '/api/quotes', { method: 'POST', body: JSON.stringify({
    customerName: 'Cliente equipo E2E',
    items: [{ description: 'iPhone 15 Pro Max 256GB', quantity: 1, unitPricePyg: 8000000 }],
    tradeIn: { model: 'iphone 13', storage: '128GB', condition: 'USED', estimatedValuePyg: 99 },
  }) })
  expect(cot.status, JSON.stringify(cot.body)).toBe(201)
  expect(cot.body.tradeIn).toMatchObject({ model: 'iPhone 13', storage: '128GB', condition: 'USED', estimatedValuePyg: 2100000 })
  const sinValor = await api(page, '/api/quotes', { method: 'POST', body: JSON.stringify({
    customerName: 'Cliente equipo E2E', items: [{ description: 'x', quantity: 1, unitPricePyg: 1000 }],
    tradeIn: { model: 'iPhone 13', storage: '512GB', condition: 'USED' },
  }) })
  expect(sinValor.status).toBe(409)

  // Vista pública: equipo, faltante y aviso fijo, sin datos internos.
  const acceso = await api(page, `/api/quotes/${cot.body.id}/access-token`, { method: 'POST', body: '{}' })
  const token = acceso.body?.token || cot.body.publicToken
  const publica = await api(page, `/api/quotes/public/${token}`)
  expect(publica.status, JSON.stringify(publica.body)).toBe(200)
  expect(publica.body.tradeIn).toMatchObject({ model: 'iPhone 13', estimatedValuePyg: 2100000, faltantePyg: 5900000 })
  expect(publica.body.tradeIn.aviso).toContain('Valor estimado sujeto a revisión')

  // Convertir: el pedido nace por el total y el equipo queda por revalidar con aviso.
  const convertida = await api(page, `/api/quotes/${cot.body.id}/convert`, { method: 'POST', body: '{}' })
  expect(convertida.status, JSON.stringify(convertida.body)).toBe(201)
  expect(Number(convertida.body.totalPyg)).toBe(8000000)
  expect(convertida.body.notes).toContain('Valor estimado sujeto a revisión')
  expect(convertida.body.notes).toContain('puede variar')
  await vendedor.close()
})
