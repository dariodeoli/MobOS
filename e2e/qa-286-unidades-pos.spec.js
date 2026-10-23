// #286 · En el POS no se muestran las unidades: reproducción y regresión.
//
// Cubre las tres causas del reporte de Dario:
//  1. el selector de IMEI descartaba las unidades cuando la venta no tenía
//     sucursal (vendedor sin sucursal) — ahora usa la elegibilidad compartida y
//     explica el caso sin sucursal;
//  2. el detalle de producto mostraba «no tiene unidades» en silencio y con el
//     alcance equivocado — ahora pide por producto + sucursal activa y muestra
//     el error con reintento;
//  3. los fallos del API se mostraban crudos — ahora hay mensaje accionable.
//
// Capturas: docs/qa/286-unidades-pos/ (claro/oscuro).
import { test, expect } from './helpers/seller-test.js'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { SEED } from './helpers/seed-data.js'
import { ensureCobro } from './helpers/ensure-cobro.js'

const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`
const DIR = process.env.QA_286_CAPTURAS || join('docs', 'qa', '286-unidades-pos')
const clave = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 900 + 100)}`.toUpperCase()

const apiPagina = (page, ruta, opciones = {}) => page.evaluate(async ({ api, ruta, opciones }) => {
  const respuesta = await fetch(`${api}${ruta}`, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...opciones })
  return { status: respuesta.status, body: await respuesta.json().catch(() => null) }
}, { api: API, ruta, opciones })

const tema = (page, modo) => page.addInitScript((m) => { try { localStorage.setItem('mobos:theme', m) } catch { /* sin storage */ } }, modo)

async function sembrar(page, { nombre, serial, branchId = SEED.branchId }) {
  const r = await apiPagina(page, '/api/products', {
    method: 'POST',
    body: JSON.stringify({ sku: `ZZ286-${nombre.slice(-6)}`, name: nombre, category: 'Celulares', pricePyg: 2200000, costPyg: 1600000, stock: 1, branchId, imei: serial }),
  })
  expect(r.status, JSON.stringify(r.body)).toBe(201)
  return r.body.id
}

test('#286 · el selector de IMEI del POS lista la unidad de la sucursal (vendedor)', async ({ page, browser }) => {
  mkdirSync(DIR, { recursive: true })
  const adminCtx = await browser.newContext({ storageState: 'e2e/.auth/admin.json' })
  const adminPage = await adminCtx.newPage()
  const nombre = `QA 286 Serial ${clave()}`
  const serial = `359286${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`
  let productId = ''
  try {
    await adminPage.goto('/inventario/unidades')
    productId = await sembrar(adminPage, { nombre, serial })

    await page.goto('/pos')
    await page.getByLabel('Nombre, teléfono, CI o RUC del cliente').fill(`Cliente 286 ${clave()}`)
    const buscar = page.getByPlaceholder('Buscar producto…')
    await buscar.fill(nombre)
    await expect(page.getByRole('button', { name: new RegExp(nombre) }).first()).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: new RegExp(nombre) }).first().click()
    await ensureCobro(page)
    await page.getByTestId('pos-cobro').getByRole('button', { name: /Confirmar venta|Crear pedido|Guardar pedido/ }).click()

    const selector = page.getByRole('dialog', { name: 'Elegir IMEI de esta venta' })
    await expect(selector).toBeVisible({ timeout: 15_000 })
    // La unidad aparece con su IMEI y se puede reservar (sin errores crudos).
    await expect(selector.getByText(serial.slice(-4), { exact: false }).first()).toBeVisible({ timeout: 15_000 })
    await expect(selector.getByTestId('picker-error')).toHaveCount(0)
    await expect(selector.getByRole('button', { name: 'Elegir' })).toBeVisible()
    await selector.getByRole('button', { name: 'Elegir' }).click()
    await expect(selector.getByRole('button', { name: 'Liberar' })).toBeVisible({ timeout: 15_000 })
    for (const modo of ['light', 'dark']) {
      await tema(page, modo)
      await page.screenshot({ path: join(DIR, `pos-picker-${modo}.png`) })
    }
    // Limpieza de la reserva antes de cerrar.
    await selector.getByRole('button', { name: 'Liberar' }).click()
    await page.keyboard.press('Escape')
  } finally {
    if (productId) await apiPagina(adminPage, `/api/products?id=${encodeURIComponent(productId)}`, { method: 'DELETE' }).catch(() => {})
    await adminCtx.close()
  }
})

test('#286/#511 · perder acceso al stock cierra el selector y exige revalidar', async ({ page, browser }) => {
  mkdirSync(DIR, { recursive: true })
  const adminCtx = await browser.newContext({ storageState: 'e2e/.auth/admin.json' })
  const adminPage = await adminCtx.newPage()
  const nombre = `QA 286 Error ${clave()}`
  const serial = `359286${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`
  let productId = ''
  try {
    await adminPage.goto('/inventario/unidades')
    productId = await sembrar(adminPage, { nombre, serial })

    await page.goto('/pos')
    await page.getByLabel('Nombre, teléfono, CI o RUC del cliente').fill(`Cliente 286 ${clave()}`)
    const buscar = page.getByPlaceholder('Buscar producto…')
    await buscar.fill(nombre)
    await expect(page.getByRole('button', { name: new RegExp(nombre) }).first()).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: new RegExp(nombre) }).first().click()
    // A partir de acá el stock responde como una sucursal ajena (403) — el caso
    // que antes mostraba el texto crudo «No autorizado para esa sucursal.».
    await ensureCobro(page)
    await page.getByTestId('pos-cobro').getByRole('button', { name: /Confirmar venta|Crear pedido|Guardar pedido/ }).click()
    const selector = page.getByRole('dialog', { name: 'Elegir IMEI de esta venta' })
    await expect(selector).toBeVisible({ timeout: 15_000 })
    await expect(selector.getByRole('button', { name: 'Elegir' })).toBeVisible({ timeout: 15_000 })

    // Una denegación retira todo el contexto privado (#502); el selector
    // no puede mantener una copia del producto solo para mostrar un error.
    const pedidosNuevos = []
    page.on('request', request => {
      if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/orders') pedidosNuevos.push(request.url())
    })
    await page.route('**/api/inventory-units**', ruta => ruta.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ message: 'No autorizado para esa sucursal.' }) }))
    const denegacion = page.waitForResponse(response => new URL(response.url()).pathname === '/api/inventory-units' && response.status() === 403)
    await selector.getByRole('button', { name: 'Elegir' }).click()
    await denegacion
    await expect(selector).toHaveCount(0)
    const aviso = page.getByTestId('pos-acceso-stock-invalidado')
    await expect(aviso).toBeVisible()
    await expect(aviso).toContainText('El acceso al stock cambió')
    await expect(aviso).not.toContainText('No autorizado para esa sucursal.')
    await expect.poll(() => page.evaluate(async () => {
      const storage = await import('/src/lib/storage.js')
      return { products: storage.getProductos().length, orders: storage.listVentas().length }
    })).toEqual({ products: 0, orders: 0 })
    await expect(page.getByTestId('pos-cobro').getByRole('button', { name: /Confirmar venta|Crear pedido|Guardar pedido/ })).toBeDisabled()
    expect(pedidosNuevos).toEqual([])
    for (const modo of ['light', 'dark']) {
      await tema(page, modo)
      await page.screenshot({ path: join(DIR, `pos-picker-error-${modo}.png`) })
    }
    await page.unroute('**/api/inventory-units**')
    const sesionValidada = page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/me' && response.status() === 200)
    await aviso.getByRole('button', { name: 'Verificar acceso' }).click()
    await sesionValidada
    await expect(page.getByTestId('pos-acceso-stock-invalidado')).toHaveCount(0)
    await page.getByPlaceholder('Buscar producto…').fill(nombre)
    await expect(page.getByRole('button', { name: new RegExp(nombre) }).first()).toBeVisible({ timeout: 15_000 })
    expect(pedidosNuevos).toEqual([])
  } finally {
    await apiPagina(adminPage, '/api/inventory-reservations', { method: 'PATCH', body: JSON.stringify({ action: 'release', serials: [serial] }) }).catch(() => {})
    if (productId) await apiPagina(adminPage, `/api/products?id=${encodeURIComponent(productId)}`, { method: 'DELETE' }).catch(() => {})
    await adminCtx.close()
  }
})

test.describe('dueño', () => {
  test.use({ storageState: 'e2e/.auth/admin.json' })

  test('#286 · «Equipos por estado» sigue la sucursal activa y no miente si falla', async ({ page, browser }) => {
    mkdirSync(DIR, { recursive: true })
    const adminCtx = await browser.newContext({ storageState: 'e2e/.auth/admin.json' })
    const adminPage = await adminCtx.newPage()
    const nombre = `QA 286 Sucursal ${clave()}`
    const serial = `359286${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`
    let productId = ''
    try {
      await adminPage.goto('/inventario/unidades')
      productId = await sembrar(adminPage, { nombre, serial })

      // Con la sucursal activa 1 (la de la unidad) el detalle la lista.
      await page.goto('/productos')
      await page.getByPlaceholder('Nombre o SKU').fill(nombre)
      await page.getByTestId('producto-fila').filter({ hasText: nombre }).first().click()
      const detalle = page.getByRole('dialog')
      const equipos = detalle.getByText('Equipos por estado').locator('xpath=ancestor::section[1]')
      await expect(equipos).toBeVisible({ timeout: 15_000 })
      await expect(equipos.getByText(serial.slice(-4), { exact: false }).first()).toBeVisible({ timeout: 15_000 })
      for (const modo of ['light', 'dark']) {
        await tema(page, modo)
        await page.screenshot({ path: join(DIR, `producto-equipos-sucursal-1-${modo}.png`) })
      }
      await detalle.getByRole('button', { name: 'Cerrar' }).click()

      // Al cambiar la sucursal activa a la 2, el detalle no puede seguir
      // mostrando equipos de la 1: explica que no hay unidades en la activa.
      await page.locator('[data-testid="sucursal-selector"]:visible').click()
      const sucursal2 = await apiPagina(adminPage, '/api/inventory-branches').then((r) => (r.body || []).find((fila) => fila.id === SEED.branch2Id))
      await page.getByTestId('sucursal-menu').getByRole('menuitemradio', { name: new RegExp(sucursal2?.name || 'Sucursal E2E Dos') }).click()
      await page.getByTestId('producto-fila').filter({ hasText: nombre }).first().click()
      const detalle2 = page.getByRole('dialog')
      const equipos2 = detalle2.getByText('Equipos por estado').locator('xpath=ancestor::section[1]')
      await expect(equipos2.getByText(/No hay unidades de este producto en la sucursal activa/)).toBeVisible({ timeout: 15_000 })
      await expect(equipos2.getByText(serial.slice(-4), { exact: false })).toHaveCount(0)
      await page.screenshot({ path: join(DIR, 'producto-equipos-sucursal-2-light.png') })
      await detalle2.getByRole('button', { name: 'Cerrar' }).click()

      // Y al volver a la sucursal de la unidad, reaparece.
      await page.locator('[data-testid="sucursal-selector"]:visible').click()
      await page.getByTestId('sucursal-menu').getByRole('menuitemradio', { name: /Sucursal E2E(?! Dos)/ }).click()
      await page.getByTestId('producto-fila').filter({ hasText: nombre }).first().click()
      const detalle3 = page.getByRole('dialog')
      const equipos3 = detalle3.getByText('Equipos por estado').locator('xpath=ancestor::section[1]')
      await expect(equipos3.getByText(serial.slice(-4), { exact: false }).first()).toBeVisible({ timeout: 15_000 })
    } finally {
      if (productId) await apiPagina(adminPage, `/api/products?id=${encodeURIComponent(productId)}`, { method: 'DELETE' }).catch(() => {})
      await adminCtx.close()
    }
  })

  test('#286 · un vendedor sin sucursal opera en su sucursal efectiva y no ve stock de otras', async ({ page, browser }) => {
    const adminCtx = await browser.newContext({ storageState: 'e2e/.auth/admin.json' })
    const adminPage = await adminCtx.newPage()
    let vendedorId = ''
    let productId = ''
    try {
      await adminPage.goto('/inventario/unidades')
      productId = await sembrar(adminPage, { nombre: `QA 286 Sin sucursal ${clave()}`, serial: `359286${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}` })
      const pin = String(Math.floor(1000 + Math.random() * 8999))
      const creado = await apiPagina(adminPage, '/api/users', { method: 'POST', body: JSON.stringify({ name: `QA 286 Vendedor ${clave()}`, pin, role: 'VENDEDOR' }) })
      expect(creado.status, JSON.stringify(creado.body)).toBe(201)
      vendedorId = creado.body.id

      const ctx = await browser.newContext()
      const suPage = await ctx.newPage()
      await suPage.goto('/login')
      const login = await suPage.evaluate(async ({ api, pin, sellerId, company }) => {
        await fetch(`${api}/api/auth/login`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: company.email, password: company.password, deviceId: 'zz286-device', branchId: '' }) })
        await fetch(`${api}/api/auth/pin`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sellerId, pin }) })
        return (await fetch(`${api}/api/auth/me`, { credentials: 'include', headers: { 'Content-Type': 'application/json' } }).then((r) => r.json()).catch(() => null))?.user
      }, { api: API, pin, sellerId: vendedorId, company: SEED.company })
      // Contrato vigente (sucursal efectiva, #286/#279 A1): sin sucursal asignada
      // el vendedor opera en la sucursal efectiva (primera del tenant), no en el vacío.
      const efectiva = login?.branchId ?? null
      expect(efectiva, JSON.stringify(login)).not.toBeNull()
      expect(efectiva, JSON.stringify(login)).toBe(SEED.branchId)

      // Ve las unidades de su sucursal efectiva…
      const unidades = await apiPagina(suPage, `/api/inventory-units?productId=${encodeURIComponent(productId)}`)
      expect(unidades.status, JSON.stringify(unidades.body)).toBe(200)
      const filas = Array.isArray(unidades.body) ? unidades.body : []
      expect(filas.length, JSON.stringify(unidades.body).slice(0, 200)).toBeGreaterThan(0)
      expect(filas.every((u) => u.branchId === efectiva), JSON.stringify(unidades.body).slice(0, 300)).toBe(true)
      // …y no puede consultar stock de otra sucursal (aislamiento).
      const ajena = await apiPagina(suPage, `/api/inventory-units?branchId=${encodeURIComponent(SEED.branch2Id)}`)
      expect(ajena.status, JSON.stringify(ajena.body)).toBe(403)
      await ctx.close()
    } finally {
      if (vendedorId) await apiPagina(adminPage, '/api/users', { method: 'PATCH', body: JSON.stringify({ id: vendedorId, status: 'INACTIVE' }) }).catch(() => {})
      if (productId) await apiPagina(adminPage, `/api/products?id=${encodeURIComponent(productId)}`, { method: 'DELETE' }).catch(() => {})
      await adminCtx.close()
    }
  })
})
