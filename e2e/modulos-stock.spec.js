// Módulos «Inventario por unidades» y «Venta sin stock»:
// - Apagado el primero, Stock abre directo en Productos (control por cantidad) y las
//   vistas de unidades desaparecen; activo, Stock abre primero en Inventario y «Vender»
//   desde una unidad lleva al POS con esa unidad ya cargada.
// - Apagado el segundo, el POS no ofrece «Sobre pedido» ni «Llega en tránsito».
// El estado de módulos se fuerza en la respuesta de GET /api/tenant/modules (lo que decide
// el front); las reglas del servidor (403 con backorder, guardas de unidades) las cubren
// los tests de backend y backend/tests/modulos-http.mjs.
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { ensureCobro } from './helpers/ensure-cobro.js'
import { SEED } from './helpers/seed-data.js'

const API = SEED.api
const SALIDA = process.env.MOBOS_QA_OUT || 'test-results/modulos-stock'
mkdirSync(SALIDA, { recursive: true })
const clave = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`.toUpperCase()

// Estado mutable de los dos módulos, aplicado sobre la respuesta real del servidor.
async function forzarModulos(page, estado) {
  await page.route('**/api/tenant/modules', async route => {
    if (route.request().method() !== 'GET') return route.continue()
    const respuesta = await route.fetch()
    const cuerpo = await respuesta.json()
    for (const [id, enabled] of Object.entries(estado)) cuerpo.state.modules[id] = { ...cuerpo.state.modules[id], enabled }
    return route.fulfill({ response: respuesta, json: cuerpo })
  })
}

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' })
})

async function api(page, ruta, opciones = {}) {
  return page.evaluate(async ({ api, ruta, opciones }) => {
    const respuesta = await fetch(`${api}${ruta}`, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...opciones })
    return { status: respuesta.status, datos: await respuesta.json().catch(() => null) }
  }, { api: API, ruta, opciones })
}

test('módulo apagado: Stock abre en Productos y las vistas de unidades no existen', async ({ page }) => {
  await forzarModulos(page, { 'inventario-unidades': false, 'venta-sin-stock': false })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/stock')
  await expect(page).toHaveURL(/\/productos$/)

  await page.goto('/stock/unidades')
  await expect(page).toHaveURL(/\/productos$/)
  await expect(page.getByTestId('aviso-modulo-apagado')).toContainText('El módulo Inventario por unidades está desactivado.')
  await expect(page.getByTestId('shell-contexto').locator('[data-tab-id="unidades"]')).toHaveCount(0)
  await expect(page.getByTestId('shell-contexto').locator('[data-tab-id="productos"]')).toHaveCount(1)
  await page.waitForTimeout(2000) // solo para la captura: deja que termine de cargar la lista
  await expect(page.getByTestId('shell-contexto')).toBeVisible()
  await page.screenshot({ path: `${SALIDA}/stock-modulo-apagado.png` })
})

test('módulo activo: Stock abre en Inventario y «Vender» desde una unidad lleva al POS con la unidad en el carrito', async ({ page }) => {
  await forzarModulos(page, { 'inventario-unidades': true })
  await page.setViewportSize({ width: 1440, height: 900 })
  const id = clave()
  const nombre = `Equipo unidad QA ${id}`
  const serial = `35${String(Date.now()).slice(-13)}`
  await page.goto('/pos')
  const producto = await api(page, '/api/products', { method: 'POST', body: JSON.stringify({ sku: `ZZ-MODSTOCK-${id}`, name: nombre, category: 'Celulares', pricePyg: 1500000, costPyg: 1000000, stock: 0, branchId: SEED.branchId }) })
  expect(producto.status, JSON.stringify(producto.datos)).toBe(201)
  const unidad = await api(page, '/api/inventory-units', { method: 'POST', body: JSON.stringify({ productId: producto.datos.id, branchId: SEED.branchId, serial }) })
  expect(unidad.status, JSON.stringify(unidad.datos)).toBe(201)

  await page.goto('/stock')
  await expect(page).toHaveURL(/\/stock\/unidades$/)
  await page.goto(`/stock/unidades?q=${encodeURIComponent(serial)}`)
  const fila = page.getByTestId('inventario-fila').filter({ hasText: serial.slice(-4) }).first()
  await expect(fila).toBeVisible({ timeout: 20_000 })
  await fila.getByLabel(/^Acciones de/).click()
  await expect(page.getByRole('menuitem', { name: 'Reservar', exact: true })).toBeVisible()
  await page.waitForTimeout(2000) // solo para la captura: deja que termine de cargar la lista
  await page.screenshot({ path: `${SALIDA}/stock-modulo-activo.png` })
  await page.getByRole('menuitem', { name: 'Vender', exact: true }).click()

  await expect(page).toHaveURL(/\/pos(\?|$)/, { timeout: 20_000 })
  await expect(page.getByText('Productos de esta venta')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText(nombre).first()).toBeVisible()
  await expect(page.locator('#pos-resumen-venta').getByText(serial.slice(-4)).first()).toBeVisible()
})

test('venta sin stock apagado: el POS no ofrece «Sobre pedido»; activo, sí', async ({ page }) => {
  const estado = { 'inventario-unidades': true, 'venta-sin-stock': false }
  await forzarModulos(page, estado)
  const id = clave()
  const nombre = `Equipo sin stock modulo QA ${id}`
  await page.goto('/pos')
  const producto = await api(page, '/api/products', { method: 'POST', body: JSON.stringify({ sku: `ZZ-MODSS-${id}`, name: nombre, category: 'Accesorios', pricePyg: 100000, costPyg: 60000, stock: 0, branchId: SEED.branchId }) })
  expect(producto.status, JSON.stringify(producto.datos)).toBe(201)
  try {
    const agregar = async () => {
      await page.goto('/pos')
      await expect(page.getByRole('heading', { name: 'Vender', exact: true, level: 1 })).toBeVisible()
      await page.getByLabel('Nombre, teléfono, CI o RUC del cliente').fill(`Cliente modulo ${id}`)
      await page.getByPlaceholder('Buscar producto…').fill(nombre)
      const tarjeta = page.getByRole('button', { name: new RegExp(nombre) }).first()
      await expect(tarjeta).toBeVisible({ timeout: 15_000 })
      await tarjeta.click()
      await expect(page.getByText('Productos de esta venta')).toBeVisible()
      await ensureCobro(page)
    }
    await agregar()
    const guia = page.getByTestId('guia-venta')
    await expect(guia).toBeVisible()
    await expect(guia).toContainText('quitalas del carrito')
    await expect(guia.getByRole('button', { name: 'Sobre pedido' })).toHaveCount(0)
    await expect(guia.getByRole('button', { name: 'Llega en tránsito' })).toHaveCount(0)

    estado['venta-sin-stock'] = true
    await agregar()
    await expect(page.getByTestId('guia-venta').getByRole('button', { name: 'Sobre pedido' })).toBeVisible()
  } finally {
    await api(page, `/api/products?id=${encodeURIComponent(producto.datos.id)}`, { method: 'DELETE' })
  }
})
