// #287 · Productos y Unidades: un mismo objeto con dos vistas.
//
// Evidencia y regresión del switch Productos ⇄ Unidades, del paso producto →
// sus unidades (y vuelta) y de las unidades en la vista del producto del POS.
// `QA_287_ANTES=1` genera el «antes» (solo captura: el código viejo no tiene
// el switch ni los enlaces).
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { SEED } from './helpers/seed-data.js'

const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`
const DIR = join('docs', 'qa', '287-objeto-unificado')
const ANTES = Boolean(process.env.QA_287_ANTES)
const PREFIJO = ANTES ? 'antes' : 'despues'
const clave = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 900 + 100)}`.toUpperCase()

const apiPagina = (page, ruta, opciones = {}) => page.evaluate(async ({ api, ruta, opciones }) => {
  const respuesta = await fetch(`${api}${ruta}`, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...opciones })
  return { status: respuesta.status, body: await respuesta.json().catch(() => null) }
}, { api: API, ruta, opciones })

const tema = (page, modo) => page.addInitScript((m) => { try { localStorage.setItem('mobos:theme', m) } catch { /* sin storage */ } }, modo)

// Producto con dos unidades: la vista de producto y la de unidades comparten
// esta realidad.
async function sembrar(page) {
  const marca = clave()
  const nombre = `ZZ287 iPhone ${marca}`
  const producto = await apiPagina(page, '/api/products', {
    method: 'POST',
    body: JSON.stringify({ sku: `ZZ287-${marca}`, name: nombre, category: 'Celulares', pricePyg: 3100000, costPyg: 2200000, stock: 0, branchId: SEED.branchId, capacity: '256 GB', color: 'Azul' }),
  })
  expect(producto.status, JSON.stringify(producto.body)).toBe(201)
  const seriales = [`ZZ287A${marca}`.slice(0, 18), `ZZ287B${marca}`.slice(0, 18)]
  for (const serial of seriales) {
    const unidad = await apiPagina(page, '/api/inventory-units', { method: 'POST', body: JSON.stringify({ productId: producto.body.id, serial, branchId: SEED.branchId, condition: 'NEW' }) })
    expect(unidad.status, JSON.stringify(unidad.body)).toBe(201)
  }
  await apiPagina(page, '/api/inventory-units/verify', { method: 'POST', body: JSON.stringify({ serial: seriales[0] }) })
  return { nombre, seriales, productId: producto.body.id }
}

async function limpiar(page, datos) {
  try {
    for (const serial of datos.seriales) {
      const lista = await apiPagina(page, `/api/inventory-units?q=${encodeURIComponent(serial)}`)
      const filas = Array.isArray(lista.body) ? lista.body : lista.body?.items || []
      for (const unidad of filas) await apiPagina(page, '/api/inventory-units', { method: 'PATCH', body: JSON.stringify({ id: unidad.id, action: 'remove', reason: 'Limpieza QA #287' }) })
    }
    if (datos.productId) await apiPagina(page, `/api/products?id=${encodeURIComponent(datos.productId)}`, { method: 'DELETE' })
  } catch { /* la limpieza no falla el test */ }
}

test('#287 · de Producto a sus Unidades y vuelta, sin perder el contexto', async ({ page }) => {
  mkdirSync(DIR, { recursive: true })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/inventario/unidades')
  const datos = await sembrar(page)
  try {
    // 1) Productos: el switch lleva a Unidades con la búsqueda puesta.
    await page.goto('/productos')
    await page.getByPlaceholder('Nombre o SKU').fill(datos.nombre)
    await page.getByTestId('producto-fila').filter({ hasText: datos.nombre }).first().click()
    const detalle = page.getByRole('dialog')
    await expect(detalle.getByText('Equipos por estado')).toBeVisible({ timeout: 15_000 })
    await page.screenshot({ path: join(DIR, `${PREFIJO}-producto-detalle-unidades-1440-light.png`) })
    for (const modo of ['dark']) {
      await tema(page, modo)
      await page.screenshot({ path: join(DIR, `${PREFIJO}-producto-detalle-unidades-1440-${modo}.png`) })
    }
    if (!ANTES) {
      // El detalle del producto ofrece ver sus unidades en Inventario.
      await detalle.getByRole('link', { name: /Ver unidades en Inventario/i }).click()
      await expect(page).toHaveURL(/\/inventario\/unidades\?.*producto=/, { timeout: 15_000 })
      // La vista de Unidades queda acotada a ese producto (con su contexto).
      await expect(page.getByTestId('inventario-filtro-producto')).toContainText(datos.nombre)
      const filas = page.getByTestId('inventario-fila')
      await expect(filas).toHaveCount(2, { timeout: 20_000 })
      await expect(filas.filter({ hasText: datos.seriales[0].slice(-4) }).first()).toBeVisible()
      await page.screenshot({ path: join(DIR, `${PREFIJO}-unidades-del-producto-1440-light.png`) })
      // El switch vuelve a Productos conservando el contexto.
      await page.getByTestId('vista-productos-unidades').getByRole('button', { name: 'Productos' }).click()
      await expect(page).toHaveURL(/\/productos\?.*q=/, { timeout: 15_000 })
      // El contexto viaja (el SKU o el nombre con el que se buscó).
      await expect(page.getByPlaceholder('Nombre o SKU')).toHaveValue(/ZZ287/)
      await page.screenshot({ path: join(DIR, `${PREFIJO}-productos-con-contexto-1440-light.png`) })
      // Y desde la unidad se puede volver a su producto.
      await page.goto(`/inventario/unidades?producto=${datos.productId}`)
      await page.getByTestId('inventario-fila').filter({ hasText: datos.seriales[0].slice(-4) }).first().click()
      const unidad = page.getByRole('dialog')
      await expect(unidad.getByRole('link', { name: /Ver producto/i })).toBeVisible({ timeout: 15_000 })
      await unidad.getByRole('link', { name: /Ver producto/i }).click()
      await expect(page).toHaveURL(/\/productos\?.*producto=/, { timeout: 15_000 })
      await expect(page.getByRole('dialog').getByText('Equipos por estado')).toBeVisible({ timeout: 15_000 })
      await page.screenshot({ path: join(DIR, `${PREFIJO}-unidad-a-producto-1440-light.png`) })
    }
  } finally {
    await limpiar(page, datos)
  }
})

test('#287 · el catálogo del POS muestra las unidades del producto', async ({ page, browser }) => {
  mkdirSync(DIR, { recursive: true })
  const adminCtx = await browser.newContext({ storageState: 'e2e/.auth/admin.json' })
  const adminPage = await adminCtx.newPage()
  let datos = null
  try {
    await adminPage.goto('/inventario/unidades')
    datos = await sembrar(adminPage)
    await page.goto('/pos')
    const buscar = page.getByPlaceholder('Buscar producto…')
    await buscar.fill(datos.nombre)
    const fila = page.getByRole('button', { name: new RegExp(datos.nombre) }).first()
    await expect(fila).toBeVisible({ timeout: 15_000 })
    if (!ANTES) {
      // La fila del catálogo dice cuántas unidades físicas tiene el producto.
      await expect(fila.getByText(/2 unidades/i)).toBeVisible({ timeout: 15_000 })
    }
    await page.setViewportSize({ width: 1440, height: 900 })
    await fila.scrollIntoViewIfNeeded()
    await page.screenshot({ path: join(DIR, `${PREFIJO}-pos-catalogo-unidades-1440-light.png`) })
    await tema(page, 'dark')
    await page.screenshot({ path: join(DIR, `${PREFIJO}-pos-catalogo-unidades-1440-dark.png`) })
    // Al agregarlo, la venta pide la unidad exacta (ya era así) y la lista sale
    // de la misma fuente.
    await fila.click()
    await page.getByTestId('pos-cobro').getByRole('button', { name: /Confirmar venta|Crear pedido|Guardar pedido/ }).click()
    const selector = page.getByRole('dialog', { name: 'Elegir IMEI de esta venta' })
    await expect(selector).toBeVisible({ timeout: 15_000 })
    await expect(selector.getByText(datos.seriales[0].slice(-4), { exact: false }).first()).toBeVisible({ timeout: 15_000 })
    await page.screenshot({ path: join(DIR, `${PREFIJO}-pos-unidad-elegida-light.png`) })
  } finally {
    if (datos) await limpiar(adminPage, datos)
    await adminCtx.close()
  }
})
