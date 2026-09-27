// #263 · Venta serializada: el POS tiene que guiar el IMEI dentro del flujo,
// nombrar QUÉ producto lo necesita, validar antes de enviar y no romper con un
// 400 de /api/orders. Un producto sin serialización no debe pedir IMEI.
import { test, expect } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'

const API = SEED.api
const clave = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`.toUpperCase()

test('venta serializada: guía el IMEI, valida antes de enviar y cierra sin 400 (#263)', async ({ page }) => {
  const nombre = `QA 263 Serial ${clave()}`
  const serial = `359263${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`
  const rechazos = []
  page.on('response', (respuesta) => {
    if (respuesta.url().includes('/api/orders') && respuesta.status() >= 400) rechazos.push(`${respuesta.status()} ${respuesta.url()}`)
  })

  // Producto serializado: el POST con IMEI crea el producto y su unidad.
  await page.goto('/pos')
  const productId = await page.evaluate(async ({ api, branchId, nombre, serial }) => {
    const respuesta = await fetch(`${api}/api/products`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sku: `ZZ-QA263-${nombre.slice(-6)}`, name: nombre, category: 'Celulares', pricePyg: 2000000, costPyg: 1500000, stock: 1, branchId, imei: serial }),
    })
    const datos = await respuesta.json().catch(() => null)
    if (!respuesta.ok) throw new Error(datos?.message || `products: ${respuesta.status}`)
    return datos.id
  }, { api: API, branchId: SEED.branchId, nombre, serial })

  try {
    await page.goto('/pos')
    await expect(page.getByRole('heading', { name: 'POS', level: 1 })).toBeVisible()
    await page.getByLabel('Nombre, teléfono, CI o RUC del cliente').fill(`Cliente 263 ${clave()}`)
    const buscar = page.getByPlaceholder('Buscar producto…')
    await buscar.fill(nombre)
    await expect(page.getByRole('button', { name: new RegExp(nombre) }).first()).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: new RegExp(nombre) }).first().click()
    await expect(page.getByText('Productos de esta venta')).toBeVisible()

    // 1) Sin IMEI: el aviso nombra el producto y se abre el selector en el flujo.
    await page.getByTestId('pos-cobro').getByRole('button', { name: /Confirmar venta|Crear pedido|Guardar pedido/ }).click()
    const aviso = page.getByText(new RegExp(`Falta elegir el IMEI/serial de «${nombre}»`))
    await expect(aviso).toBeVisible()
    const selector = page.getByRole('dialog', { name: 'Elegir IMEI de esta venta' })
    await expect(selector).toBeVisible()
    await page.screenshot({ path: 'test-results/qa-263/guia-imei.png' })

    // 2) Validar ANTES de enviar: no sale ningún POST /api/orders sin el serial.
    await page.waitForTimeout(800)
    expect(rechazos, `no debe salir un pedido incompleto: ${rechazos.join(' | ')}`).toEqual([])
    await expect(selector).toBeVisible()
    await page.screenshot({ path: 'test-results/qa-263/venta-bloqueada-con-guia.png' })
    await selector.getByRole('button', { name: 'Listo' }).click()
    // La venta serializada de punta a punta (elegir IMEI y cerrar) está cubierta
    // por `pos-checkout.spec.js` («POS vende un equipo serializado con su IMEI»).
  } finally {
    await page.evaluate(async ({ api, productId }) => {
      await fetch(`${api}/api/products?id=${encodeURIComponent(productId)}`, { method: 'DELETE', credentials: 'include' }).catch(() => {})
    }, { api: API, productId })
  }
})

test('un producto sin serialización no pide IMEI y vende sin fricción (#263)', async ({ page }) => {
  const nombre = `QA 263 Simple ${clave()}`
  const rechazos = []
  page.on('response', (respuesta) => {
    if (respuesta.url().includes('/api/orders') && respuesta.status() >= 400) rechazos.push(`${respuesta.status()} ${respuesta.url()}`)
  })
  await page.goto('/pos')
  const productId = await page.evaluate(async ({ api, branchId, nombre }) => {
    const respuesta = await fetch(`${api}/api/products`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sku: `ZZ-QA263S-${nombre.slice(-6)}`, name: nombre, category: 'Accesorios', pricePyg: 120000, costPyg: 60000, stock: 2, branchId }),
    })
    return (await respuesta.json()).id
  }, { api: API, branchId: SEED.branchId, nombre })

  try {
    await page.goto('/pos')
    await expect(page.getByRole('heading', { name: 'POS', level: 1 })).toBeVisible()
    await page.getByLabel('Nombre, teléfono, CI o RUC del cliente').fill(`Cliente simple ${clave()}`)
    const buscar = page.getByPlaceholder('Buscar producto…')
    await buscar.fill(nombre)
    await expect(page.getByRole('button', { name: new RegExp(nombre) }).first()).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: new RegExp(nombre) }).first().click()
    await expect(page.getByText('Productos de esta venta')).toBeVisible()

    await page.getByTestId('pos-cobro').getByRole('button', { name: /Confirmar venta|Crear pedido|Guardar pedido/ }).click()
    await expect(page.getByText(/Falta elegir el IMEI\/serial/)).toHaveCount(0)
    await expect(page.getByText(/Venta registrada|Pedido .* creado/).first()).toBeVisible({ timeout: 20_000 })
    expect(rechazos).toEqual([])
  } finally {
    await page.evaluate(async ({ api, productId }) => {
      await fetch(`${api}/api/products?id=${encodeURIComponent(productId)}`, { method: 'DELETE', credentials: 'include' }).catch(() => {})
    }, { api: API, productId })
  }
})
