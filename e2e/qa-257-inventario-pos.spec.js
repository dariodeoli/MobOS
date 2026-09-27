// #257 · El inventario no figuraba en el POS: un producto creado en Inventario
// (u otra pestaña/persona) no aparecía al volver al POS porque el catálogo vive
// en un espejo local que solo se hidrata al arrancar la app (#247).
//
// Regresiones cubiertas:
//  a) navegación SPA Inventario → POS con el catálogo cacheado,
//  b) recarga completa del POS (la "foto" local hidrata al instante y refresca).
import { test, expect } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'

const API = SEED.api
const clave = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`.toUpperCase()

async function crearProductoInventario(page, nombre) {
  return page.evaluate(async ({ api, branchId, nombre }) => {
    const respuesta = await fetch(`${api}/api/products`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sku: `ZZ-QA257-${nombre.slice(-6)}`,
        name: nombre,
        category: 'Accesorios',
        pricePyg: 123000,
        costPyg: 60000,
        stock: 3,
        branchId,
      }),
    })
    const datos = await respuesta.json().catch(() => null)
    if (!respuesta.ok) throw new Error(datos?.message || `products: ${respuesta.status}`)
    return datos.id
  }, { api: API, branchId: SEED.branchId, nombre })
}

async function borrarProducto(page, productId) {
  await page.evaluate(async ({ api, productId }) => {
    await fetch(`${api}/api/products?id=${encodeURIComponent(productId)}`, { method: 'DELETE', credentials: 'include' }).catch(() => {})
  }, { api: API, productId })
}

test('el producto creado en Inventario aparece en el POS al volver sin recargar (#257)', async ({ page }) => {
  const nombre = `QA 257 SPA ${clave()}`

  // 1) POS cargado (catálogo hidratado al arrancar).
  await page.goto('/pos')
  await expect(page.getByRole('heading', { name: /^(POS|Nueva venta)$/, level: 1 })).toBeVisible()
  await expect(page.getByRole('button', { name: /iPhone 15 E2E Serial/ }).first()).toBeVisible({ timeout: 20_000 })

  // 2) Alta en Inventario (como si fuese otra pestaña o el dueño en Productos).
  const productId = await crearProductoInventario(page, nombre)

  try {
    // 3) Volver al POS por navegación SPA (sin recargar la app).
    await page.locator('aside nav button[aria-label="Productos"]').click()
    await expect(page).toHaveURL(/\/productos$/)
    await page.locator('aside nav button[aria-label="POS"]').click()
    await expect(page).toHaveURL(/\/pos$/)
    await expect(page.getByRole('heading', { name: /^(POS|Nueva venta)$/, level: 1 })).toBeVisible()

    const buscar = page.getByPlaceholder('Buscar producto…')
    await buscar.fill(nombre)
    // La captura deja ver el encabezado del catálogo («disponibles») y el resultado.
    await page.getByPlaceholder('Buscar producto…').scrollIntoViewIfNeeded().catch(() => {})
    await page.waitForTimeout(400)
    await page.screenshot({ path: 'test-results/qa-257/pos-spa-buscando.png' })
    await expect(
      page.getByRole('button', { name: new RegExp(nombre) }).first(),
      'el producto de Inventario tiene que verse en el POS al volver',
    ).toBeVisible({ timeout: 20_000 })
    await page.waitForTimeout(300)
    await page.screenshot({ path: 'test-results/qa-257/pos-spa-visible.png' })
  } finally {
    await borrarProducto(page, productId)
  }
})

test('el producto creado en Inventario aparece en el POS tras recargar (#257)', async ({ page }) => {
  const nombre = `QA 257 reload ${clave()}`

  await page.goto('/pos')
  await expect(page.getByRole('heading', { name: /^(POS|Nueva venta)$/, level: 1 })).toBeVisible()
  await expect(page.getByRole('button', { name: /iPhone 15 E2E Serial/ }).first()).toBeVisible({ timeout: 20_000 })
  await page.waitForTimeout(2500) // deja guardar la foto local del catálogo

  const productId = await crearProductoInventario(page, nombre)

  try {
    await page.reload()
    await expect(page.getByRole('heading', { name: /^(POS|Nueva venta)$/, level: 1 })).toBeVisible()
    const buscar = page.getByPlaceholder('Buscar producto…')
    await buscar.fill(nombre)
    await page.getByPlaceholder('Buscar producto…').scrollIntoViewIfNeeded().catch(() => {})
    await page.waitForTimeout(400)
    await page.screenshot({ path: 'test-results/qa-257/pos-reload-buscando.png' })
    await expect(
      page.getByRole('button', { name: new RegExp(nombre) }).first(),
      'el producto de Inventario tiene que verse en el POS al recargar',
    ).toBeVisible({ timeout: 20_000 })
    await page.waitForTimeout(300)
    await page.screenshot({ path: 'test-results/qa-257/pos-reload-visible.png' })
  } finally {
    await borrarProducto(page, productId)
  }
})
