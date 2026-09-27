// Evidencia de #148 §9 (montos y monedas) con la migración bigint:
// - un monto que antes no entraba (3.000 millones) ahora se guarda y se puede anular;
// - por encima del tope del contexto (general 10.000.000.000; ventas 99.000.000.000)
//   el campo marca y el guardado bloquea con el mensaje del tope;
// - API + UI con capturas.
//
// Uso: QA_API_URL=http://localhost:3115 QA_BASE_URL=http://localhost:5215 \
//   node scripts/qa-148-montos-monedas.mjs
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect } from '@playwright/test'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const API = process.env.QA_API_URL || 'http://localhost:3115'
const WEB = process.env.QA_BASE_URL || 'http://localhost:5215'
const SALIDA = join(RAIZ, 'docs/qa/148-9-montos-monedas')
mkdirSync(SALIDA, { recursive: true })

const resultados = []
const ver = async (nombre, fn) => {
  try {
    const detalle = await fn()
    resultados.push({ nombre, ok: true, detalle: detalle || '' })
    console.log(`OK    ${nombre}${detalle ? ` — ${detalle}` : ''}`)
  } catch (error) {
    resultados.push({ nombre, ok: false, detalle: String(error?.message || error).slice(0, 300) })
    console.log(`FALLO ${nombre} — ${String(error?.message || error).slice(0, 180)}`)
  }
}

const loginRespuesta = await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', origin: WEB }, body: JSON.stringify({ email: 'e2e-tienda@test.local', password: 'E2e-password-123', deviceId: 'qa-148m' }) })
const login = await loginRespuesta.json()
let cookies = (loginRespuesta.headers.getSetCookie?.() || []).map((fila) => fila.split(';')[0]).join('; ')
const admin = (login.sellers || []).find((fila) => fila.name === 'Administrador')
const pinRespuesta = await fetch(`${API}/api/auth/pin`, { method: 'POST', headers: { 'content-type': 'application/json', origin: WEB, cookie: cookies }, body: JSON.stringify({ sellerId: admin.id, pin: '1234' }) })
cookies = `${cookies}${(pinRespuesta.headers.getSetCookie?.() || []).map((fila) => `; ${fila.split(';')[0]}`).join('')}`
const api = async (ruta, body) => {
  const respuesta = await fetch(`${API}${ruta}`, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', origin: WEB, cookie: cookies }, ...(body ? { body: JSON.stringify(body) } : {}) })
  return { status: respuesta.status, data: await respuesta.json().catch(() => null) }
}

const TRES_MIL_MILLONES = 3_000_000_000
const DOS_MIL_MILLONES = 2_000_000_000
const SOBRE_GENERAL = 10_000_000_000 + 1
const SOBRE_VENTAS = 99_000_000_000 + 1

await ver('API: un cheque de 3.000 millones entra (antes lo rechazaba el tope de 32 bits)', async () => {
  const alta = await api('/api/finance', { action: 'movement', kind: 'CHEQUE', direction: 'OUT', currency: 'PYG', originalAmount: String(TRES_MIL_MILLONES), exchangeRatePyg: '1', description: `QA §9 bigint ${Date.now().toString(36)}` })
  expect(alta.status).toBe(201)
  expect(Number(alta.data?.amountPyg)).toBe(TRES_MIL_MILLONES)
  const anular = await api('/api/finance', { action: 'void', id: alta.data.id })
  expect(anular.status).toBe(200)
  return `alta=201 (monto ${alta.data.amountPyg}) · anulación=${anular.status}`
})

await ver('API: por encima del tope general el guardado se rechaza con el número', async () => {
  const r = await api('/api/finance', { action: 'movement', kind: 'EXPENSE', direction: 'OUT', currency: 'PYG', originalAmount: String(SOBRE_GENERAL), exchangeRatePyg: '1', description: `QA §9 tope general ${Date.now().toString(36)}` })
  expect([400, 422]).toContain(r.status)
  expect(JSON.stringify(r.data)).toMatch(/10\.000\.000\.000/)
  return `status=${r.status} · ${r.data?.message || ''}`
})

await ver('API: un cheque de 2.000 millones se guarda y se puede anular', async () => {
  const alta = await api('/api/finance', { action: 'movement', kind: 'CHEQUE', direction: 'OUT', currency: 'PYG', originalAmount: String(DOS_MIL_MILLONES), exchangeRatePyg: '1', description: `QA §9 dentro del tope ${Date.now().toString(36)}` })
  expect(alta.status).toBe(201)
  const anular = await api('/api/finance', { action: 'void', id: alta.data.id })
  expect(anular.status).toBe(200)
  return `alta=201 · anulación=${anular.status}`
})

await ver('API: una venta de 3.000 millones se guarda y se cobra', async () => {
  const marca = Date.now().toString(36)
  const cliente = await api('/api/customers', { name: `QA §9 cliente ${marca}`, phone: '0981555000', countryCode: '+595' })
  const producto = await api('/api/products', { name: `QA §9 producto ${marca}`, sku: `QA9-${marca}`, pricePyg: TRES_MIL_MILLONES, stock: 1 })
  expect([200, 201]).toContain(producto.status)
  const orden = await api('/api/orders', { customerId: cliente.data?.id, items: [{ productId: producto.data?.id, description: 'QA §9', quantity: 1, unitPricePyg: TRES_MIL_MILLONES }], payments: [{ method: 'CASH', amountPyg: TRES_MIL_MILLONES, status: 'CONFIRMED' }] })
  expect([200, 201]).toContain(orden.status)
  return `producto=${producto.status} · orden=${orden.status} · total=${orden.data?.totalPyg}`
})

await ver('API: una venta por encima del tope de ventas (99B) se rechaza', async () => {
  const marca = Date.now().toString(36)
  const producto = await api('/api/products', { name: `QA §9 grande ${marca}`, sku: `QA9G-${marca}`, pricePyg: 5_000_000_000, stock: 20 })
  if (producto.status !== 201) return `el producto grande ya se rechaza: status=${producto.status} · ${producto.data?.message || ''}`
  const orden = await api('/api/orders', { items: [{ productId: producto.data.id, description: 'QA §9 grande', quantity: 20, unitPricePyg: 5_000_000_000 }], payments: [{ method: 'CASH', amountPyg: SOBRE_VENTAS, status: 'CONFIRMED' }] })
  expect(orden.status).not.toBe(201)
  return `orden rechazada: status=${orden.status} · ${orden.data?.message || ''}`
})

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
await ctx.addCookies(cookies.split('; ').map((par) => { const [name, ...resto] = par.split('='); return { name, value: resto.join('='), domain: 'localhost', path: '/' } }))
const page = await ctx.newPage()

await ver('Gastos: 3.000 millones entran y quedan guardados', async () => {
  await page.goto(`${WEB}/finanzas/gastos`)
  await page.locator('#monto-gasto').waitFor({ timeout: 30000 })
  await page.locator('#monto-gasto').fill('3000000000')
  await page.locator('#descripcion').fill(`QA §9 bigint ${Date.now().toString(36)}`)
  await expect(page.locator('#monto-gasto')).toHaveValue('3.000.000.000')
  await expect(page.locator('#monto-gasto')).not.toHaveAttribute('aria-invalid', 'true')
  await page.getByRole('button', { name: 'Guardar movimiento' }).click()
  // El formulario se limpia cuando el movimiento quedó guardado.
  await expect(page.locator('#monto-gasto')).toHaveValue('', { timeout: 10000 })
  await page.screenshot({ path: join(SALIDA, 'gastos-3b-guardado.jpg'), type: 'jpeg', quality: 72 })
  return '3.000 millones guardados sin marcar el campo'
})

await ver('Gastos: por encima del tope general el campo marca y el guardado bloquea', async () => {
  await page.locator('#monto-gasto').fill('10000000001')
  await page.locator('#descripcion').fill('QA §9 sobre el tope general')
  await expect(page.locator('#monto-gasto')).toHaveAttribute('aria-invalid', 'true')
  await page.getByRole('button', { name: 'Guardar movimiento' }).click()
  await expect(page.getByText(/máximo que el sistema puede guardar/)).toBeVisible({ timeout: 10000 })
  await page.screenshot({ path: join(SALIDA, 'gastos-sobre-tope-general.jpg'), type: 'jpeg', quality: 72 })
  return 'campo completo, marcado y bloqueado con mensaje'
})

await ver('Caja: el monto por encima del tope general también avisa', async () => {
  await page.goto(`${WEB}/finanzas/caja`)
  await expect(page.getByRole('heading', { name: /Abrir caja|Cerrar caja/ })).toBeVisible({ timeout: 30000 })
  if (await page.getByRole('heading', { name: 'Abrir caja' }).count()) {
    await page.locator('#opening').fill('10000000001')
    await page.getByRole('button', { name: 'Abrir caja', exact: true }).click()
  } else {
    await page.locator('#counted').fill('10000000001')
    await page.getByRole('button', { name: /Cerrar caja/ }).first().click()
  }
  await expect(page.getByText(/máximo que el sistema puede guardar/)).toBeVisible({ timeout: 10000 })
  await page.screenshot({ path: join(SALIDA, 'caja-sobre-tope-general.jpg'), type: 'jpeg', quality: 72 })
  return 'bloqueado con mensaje'
})

writeFileSync(join(SALIDA, 'resultados-bigint.json'), JSON.stringify({ resultados }, null, 2))
await browser.close()
const fallos = resultados.filter((fila) => !fila.ok)
console.log(`\n${resultados.length - fallos.length}/${resultados.length} verificaciones OK`)
if (fallos.length) process.exitCode = 1
