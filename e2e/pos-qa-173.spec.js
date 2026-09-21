// Campaña QA #173: cobertura del POS nuevo con catálogo/stock real.
// - Venta completa: producto creado desde Inventario → POS → pedido → stock descontado.
// - Split con cotización: parte en Gs y parte en una cuenta USD con cotización.
// - Borrador con enlace público: se abre sin sesión y muestra el carrito.
// Los hallazgos de dominio se reportan (no se corrigen acá).
import { test, expect } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'

const API = SEED.api
const clave = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`.toUpperCase()

// Producto real de inventario: nace con stock por el contador (sin unidades).
async function crearProducto(page, { nombre, precio = 100000, stock = 2, extra = {} }) {
  await page.goto('/pos')
  return page.evaluate(async ({ api, branchId, nombre, precio, stock, extra }) => {
    const respuesta = await fetch(`${api}/api/products`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sku: `ZZ-QA183-${nombre.slice(-6)}`, name: nombre, category: 'Accesorios', pricePyg: precio, costPyg: 60000, stock, branchId, ...extra }),
    })
    const datos = await respuesta.json().catch(() => null)
    if (!respuesta.ok) throw new Error(datos?.message || `products: ${respuesta.status}`)
    return { productId: datos.id }
  }, { api: API, branchId: SEED.branchId, nombre, precio, stock, extra })
}

async function stockDe(page, productId) {
  return page.evaluate(async ({ api, productId }) => {
    const filas = await fetch(`${api}/api/products?q=`, { credentials: 'include' }).then(r => r.json())
    return (Array.isArray(filas) ? filas : []).find(p => p.id === productId)?.stock ?? null
  }, { api: API, productId })
}

async function pedidoDe(page, cliente) {
  return page.evaluate(async ({ api, cliente }) => {
    const filas = await fetch(`${api}/api/orders`, { credentials: 'include' }).then(r => r.json())
    return (Array.isArray(filas) ? filas : []).find(o => o.customer?.name === cliente) || null
  }, { api: API, cliente })
}

async function pagarEnPos(page, { cliente, producto, pagos }) {
  await page.goto('/pos')
  await expect(page.getByRole('heading', { name: 'Nueva venta' })).toBeVisible()
  await page.getByLabel('Nombre, teléfono, CI o RUC del cliente').fill(cliente)
  const search = page.getByPlaceholder('Buscar producto…')
  await search.fill(producto)
  const card = page.getByRole('button', { name: new RegExp(producto) })
  await expect(card).toBeVisible({ timeout: 15_000 })
  await card.click()
  await expect(page.getByText('Productos de esta venta')).toBeVisible()

  const pagosSection = page.locator('div.space-y-3').filter({ has: page.getByText('Pagos de esta venta') })
  for (const [indice, pago] of pagos.entries()) {
    await page.getByRole('button', { name: '+ Agregar pago' }).click()
    await pagosSection.getByLabel('Cuenta de cobro').nth(indice).click()
    await page.getByRole('option', { name: new RegExp(pago.cuenta) }).click()
    await pagosSection.getByLabel('Monto original').nth(indice).fill(pago.monto)
    if (pago.cotizacion) {
      const cotizacion = pagosSection.getByLabel('Cotización').nth(indice)
      if (await cotizacion.count()) await cotizacion.fill(pago.cotizacion)
    }
  }
  await expect(page.getByRole('button', { name: /^(Confirmar venta|Crear pedido)/ })).toBeVisible()
  await page.getByRole('button', { name: /^(Confirmar venta|Crear pedido)/ }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Venta registrada correctamente.' })).toBeVisible({ timeout: 20_000 })
}

test('venta completa desde inventario: el POS vende el producto y descuenta stock', async ({ page }) => {
  const id = clave()
  const nombre = `Equipo QA ${id}`
  const cliente = `Cliente QA ${id}`
  const { productId } = await crearProducto(page, { nombre, stock: 2 })
  try {
    await pagarEnPos(page, { cliente, producto: nombre, pagos: [{ cuenta: 'Caja E2E', monto: '100000' }] })
    const orden = await pedidoDe(page, cliente)
    expect(orden, 'el pedido queda registrado').toBeTruthy()
    expect(Number(orden.totalPyg)).toBe(100000)
    expect(await stockDe(page, productId), 'el stock baja de 2 a 1').toBe(1)
  } finally {
    await page.evaluate(async ({ api, productId }) => {
      await fetch(`${api}/api/products?id=${encodeURIComponent(productId)}`, { method: 'DELETE', credentials: 'include' }).catch(() => {})
    }, { api: API, productId })
  }
})

test('split con cotización: parte en guaraníes y parte en dólares', async ({ page }) => {
  // Hallazgo 173-A (POS): con una cuenta USD y su cotización, el POS deja un
  // pendiente en Gs que no corresponde (100.000 − 25.000 − 10 USD @7500 dio
  // Pendiente Gs 15.440 y no dejó confirmar). Se corre como falla esperada
  // hasta que POS lo corrija; si pasa, hay que quitar el test.fail.
  test.fail(true, 'Hallazgo 173-A: el split con cuenta USD y cotización deja pendiente y no confirma')
  const id = clave()
  const nombre = `Equipo split QA ${id}`
  const cliente = `Cliente split QA ${id}`
  const { productId } = await crearProducto(page, { nombre, precio: 100000, stock: 1 })
  // Cuenta en dólares para cobrar la segunda parte.
  await page.evaluate(async ({ api, id }) => {
    const respuesta = await fetch(`${api}/api/payment-accounts`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: `Cuenta USD QA ${id}`, currency: 'USD', kind: 'CASH', isActive: true, feePercent: 0 }) })
    if (!respuesta.ok) throw new Error((await respuesta.json().catch(() => null))?.message || `payment-accounts: ${respuesta.status}`)
  }, { api: API, id })
  try {
    await pagarEnPos(page, { cliente, producto: nombre, pagos: [
      { cuenta: 'Caja E2E', monto: '25000' },
      { cuenta: `Cuenta USD QA ${id}`, monto: '10', cotizacion: '7500' },
    ] })
    const orden = await pedidoDe(page, cliente)
    expect(orden, 'el pedido queda registrado').toBeTruthy()
    const confirmados = (orden.payments || []).filter(p => p.status === 'CONFIRMED')
    expect(confirmados.length).toBeGreaterThanOrEqual(2)
    const enDolares = confirmados.find(p => p.currency === 'USD')
    expect(enDolares, 'la parte en dólares queda con su cotización').toBeTruthy()
    expect(Number(enDolares.originalAmount)).toBe(10)
    expect(Number(enDolares.exchangeRatePyg)).toBe(7500)
    expect(Number(enDolares.amountPyg)).toBe(75000)
  } finally {
    await page.evaluate(async ({ api, productId }) => {
      await fetch(`${api}/api/products?id=${encodeURIComponent(productId)}`, { method: 'DELETE', credentials: 'include' }).catch(() => {})
    }, { api: API, productId })
  }
})

test('el borrador con enlace público se abre sin sesión y muestra el carrito', async ({ page, browser }) => {
  const id = clave()
  const nombre = `Equipo borrador QA ${id}`
  const { productId } = await crearProducto(page, { nombre, precio: 150000, stock: 1 })
  let contexto
  try {
    // Se suspende el carrito y se genera su enlace público (misma API que usa el POS).
    const enlace = await page.evaluate(async ({ api, productId, branchId }) => {
      const pedir = async (ruta, opciones = {}) => {
        const respuesta = await fetch(`${api}/api/${ruta}`, { credentials: 'include', headers: opciones.body ? { 'Content-Type': 'application/json' } : undefined, ...opciones })
        const payload = await respuesta.json().catch(() => null)
        if (!respuesta.ok) throw new Error(`${ruta}: ${payload?.message || respuesta.status}`)
        return payload
      }
      const suspendida = await pedir('suspended-sales', { method: 'POST', body: JSON.stringify({ branchId, label: 'QA 173', payload: { items: [{ productId, name: 'Equipo borrador', quantity: 1, unitPricePyg: 150000 }], totalPyg: 150000 } }) })
      const publica = await pedir('suspended-sales', { method: 'PATCH', body: JSON.stringify({ id: suspendida.id }) })
      return publica?.token || publica?.publicToken || null
    }, { api: API, productId, branchId: SEED.branchId })
    expect(enlace, 'el borrador devuelve un token público').toBeTruthy()

    // Sin sesión: contexto nuevo y limpio.
    contexto = await browser.newContext()
    const anonima = await contexto.newPage()
    await anonima.goto(`/carrito/${enlace}`)
    await expect(anonima.locator('body')).toContainText(/Equipo borrador|QA 173/i, { timeout: 20_000 })
  } finally {
    await contexto?.close()
    await page.evaluate(async ({ api, productId }) => {
      await fetch(`${api}/api/products?id=${encodeURIComponent(productId)}`, { method: 'DELETE', credentials: 'include' }).catch(() => {})
    }, { api: API, productId })
  }
})
