// Retención de IMEI en el carrito del POS (apartado de 5 min): elegir sin cliente,
// chip «Apartado · m:ss», «Retenida por X · m:ss» para otro vendedor a 375 px y
// liberación al quitar el IMEI. Capturas: docs/rediseno/reserva-*.png (máx. 2).
import { test, expect } from './helpers/seller-test.js'
import { request as pwRequest } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { SEED } from './helpers/seed-data.js'

const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`
const clave = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 900 + 100)}`.toUpperCase()

const apiPagina = (page, ruta, opciones = {}) => page.evaluate(async ({ api, ruta, opciones }) => {
  const respuesta = await fetch(`${api}${ruta}`, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...opciones })
  return { status: respuesta.status, body: await respuesta.json().catch(() => null) }
}, { api: API, ruta, opciones })

// Sesión propia del segundo vendedor para retener por API (empresa + PIN).
async function contextoVendedorDos() {
  const sembrado = JSON.parse(await readFile('e2e/.auth/.seeded', 'utf8'))
  const vendedor = sembrado.sellers.find((s) => s.name === SEED.sellers[1].name)
  const ctx = await pwRequest.newContext({ baseURL: SEED.api, extraHTTPHeaders: { Origin: `http://localhost:${process.env.MOBOS_E2E_WEB_PORT || '5175'}` } })
  const login = await ctx.post('/api/auth/login', { data: { email: SEED.company.email, password: SEED.company.password, deviceId: `e2e-reserva-dos-${clave()}` } })
  if (!login.ok()) throw new Error(`login de empresa: HTTP ${login.status()} ${await login.text()}`)
  const pin = await ctx.post('/api/auth/pin', { data: { sellerId: vendedor.id, pin: vendedor.pin } })
  if (!pin.ok()) throw new Error(`PIN del vendedor dos: HTTP ${pin.status()} ${await pin.text()}`)
  return ctx
}

test('apartado de IMEI en el carrito: chip con contador, «Retenida por» a 375 px y liberar al quitar', async ({ page, browser }) => {
  mkdirSync('docs/rediseno', { recursive: true })
  await page.setViewportSize({ width: 375, height: 812 })
  const adminCtx = await browser.newContext({ storageState: 'e2e/.auth/admin.json' })
  const adminPage = await adminCtx.newPage()
  const dos = await contextoVendedorDos()
  const nombre = `Reserva Carrito ${clave()}`
  const serialA = `35970${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`
  const serialB = `35971${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`
  let productId = ''
  try {
    await adminPage.goto('/inventario/unidades')
    let r = await apiPagina(adminPage, '/api/products', { method: 'POST', body: JSON.stringify({ sku: `RC-${nombre.slice(-6)}`, name: nombre, category: 'Celulares', pricePyg: 2200000, costPyg: 1600000, stock: 1, branchId: SEED.branchId, imei: serialA }) })
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    productId = r.body.id
    r = await apiPagina(adminPage, '/api/inventory-units', { method: 'POST', body: JSON.stringify({ productId, branchId: SEED.branchId, serials: [serialB] }) })
    expect(r.status, JSON.stringify(r.body)).toBe(201)

    // El vendedor Dos retiene la unidad B desde su propio carrito.
    const retencion = await dos.post('/api/inventory-reservations/holds', { data: { cartId: `cart-dos-${clave()}`.toLowerCase(), deviceId: 'dispositivo-dos-e2e', serials: [serialB], branchId: SEED.branchId } })
    expect(retencion.status(), await retencion.text()).toBe(201)

    // El vendedor Uno arma la venta SIN elegir cliente y elige la unidad libre.
    await page.goto('/pos')
    await expect(page.getByRole('region', { name: 'Nueva venta' })).toBeVisible()
    await page.getByPlaceholder('Buscar producto…').fill(nombre)
    await expect(page.getByRole('button', { name: new RegExp(nombre) }).first()).toBeVisible({ timeout: 20_000 })
    await page.getByRole('button', { name: new RegExp(nombre) }).first().click()
    // Debajo de 768 px el carrito vive en una hoja que abre la barra fija.
    await page.getByTestId('pos-barra-carrito-abrir').click()
    const fila = page.locator('#pos-resumen-venta .divide-y > div').filter({ hasText: nombre })
    await fila.getByRole('button', { name: /^Elegir IMEI de / }).click()
    const selector = page.getByRole('dialog', { name: /Elegir IMEI/ })
    await expect(selector).toBeVisible()

    // La otra unidad aparece deshabilitada con quién la retiene y cuánto le queda.
    const retenida = selector.getByTestId('picker-unidad-retenida')
    await expect(retenida).toBeVisible({ timeout: 15_000 })
    await expect(retenida.getByTestId('picker-retenida-por')).toHaveText(/^Retenida por Vendedor E2E Dos · \d:\d{2}$/)
    await expect(retenida.getByRole('button', { name: 'Retenida' })).toBeDisabled()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: 'docs/rediseno/reserva-picker-375.png' })

    // Elegir la libre la aparta sin pedir cliente: la línea muestra el contador.
    await selector.getByTestId('picker-unidad').getByRole('button', { name: 'Elegir' }).click()
    await selector.getByRole('button', { name: 'Listo' }).click()
    const chip = fila.getByTestId('chip-apartado')
    await expect(chip).toHaveText(/^Apartado · \d:\d{2}$/, { timeout: 15_000 })
    await expect(chip).toHaveAttribute('data-estado', 'ok')
    const antes = await chip.textContent()
    await expect.poll(async () => chip.textContent(), { timeout: 5_000 }).not.toBe(antes)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: 'docs/rediseno/reserva-chip-375.png' })

    // Otro vendedor no la puede retener mientras tanto…
    const tomada = await dos.post('/api/inventory-reservations/holds', { data: { cartId: `cart-dos2-${clave()}`.toLowerCase(), serials: [serialA], branchId: SEED.branchId } })
    expect(tomada.status()).toBe(409)
    expect((await tomada.json()).message).toMatch(/^Retenida por Vendedor E2E Uno · \d+:\d{2}$/)

    // …y al quitar el IMEI de la línea se libera.
    await fila.getByRole('button', { name: /^Ver detalle de / }).click()
    await fila.getByRole('button', { name: 'Quitar IMEI' }).click()
    await expect(fila.getByTestId('chip-apartado')).toHaveCount(0)
    await expect.poll(async () => (await dos.post('/api/inventory-reservations/holds', { data: { cartId: `cart-dos3-${clave()}`.toLowerCase(), serials: [serialA], branchId: SEED.branchId } })).status(), { timeout: 15_000 }).toBe(201)
  } finally {
    if (productId) await apiPagina(adminPage, `/api/products?id=${encodeURIComponent(productId)}`, { method: 'DELETE' }).catch(() => {})
    await dos.dispose()
    await adminCtx.close()
  }
})
