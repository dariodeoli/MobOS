// #309 · POS: orden de trabajo, densidad y feedback (auditoría del demo v1.0.209).
// - Producto y búsqueda antes que el cliente; con ficha elegida el cliente se
//   lee en una línea.
// - Carrito fijo en la columna derecha (escritorio) y Total + acción principal
//   fijos abajo (celular).
// - El total no se repite: vive una sola vez, en el carrito.
// - Gift cards, Analytics y Ventas suspendidas viven en «Más».
// - Feedback visible al guardar/imprimir/enviar.
// - Soporte: una línea sobre pedido puede quedar «en tránsito» (reserva
//   anticipada del lote que ingresa; la conciliación la hace Inventario).
// Los hallazgos de otros dominios se reportan, no se corrigen acá.
import { test, expect } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'

const API = SEED.api
const clave = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`.toUpperCase()

async function crearProducto(page, { nombre, precio = 90000, stock = 0 }) {
  await page.goto('/pos')
  return page.evaluate(async ({ api, branchId, nombre, precio, stock }) => {
    const respuesta = await fetch(`${api}/api/products`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sku: `ZZ-QA309-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
        name: nombre, category: 'Accesorios', pricePyg: precio, costPyg: 60000, stock, branchId,
      }),
    })
    const datos = await respuesta.json().catch(() => null)
    if (!respuesta.ok) throw new Error(datos?.message || `products: ${respuesta.status}`)
    return { productId: datos.id }
  }, { api: API, branchId: SEED.branchId, nombre, precio, stock })
}

async function crearCliente(page, nombre) {
  await page.goto('/pos')
  return page.evaluate(async ({ api, nombre }) => {
    const respuesta = await fetch(`${api}/api/customers`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nombre, phone: '981123456' }),
    })
    const datos = await respuesta.json().catch(() => null)
    if (!respuesta.ok) throw new Error(datos?.message || `customers: ${respuesta.status}`)
    return datos?.customer || datos
  }, { api: API, nombre })
}

async function borrarProducto(page, productId) {
  await page.evaluate(async ({ api, productId }) => {
    await fetch(`${api}/api/products?id=${encodeURIComponent(productId)}`, { method: 'DELETE', credentials: 'include' }).catch(() => {})
  }, { api: API, productId })
}

async function agregarProducto(page, nombre) {
  const buscar = page.getByPlaceholder('Buscar producto…')
  await buscar.fill(nombre)
  const tarjeta = page.getByRole('button', { name: new RegExp(nombre) }).first()
  await expect(tarjeta).toBeVisible({ timeout: 15_000 })
  await tarjeta.click()
  await expect(page.getByText('Productos de esta venta')).toBeVisible()
}

const posicionDe = (page, selector) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel.startsWith('#') ? sel : `[data-testid="${sel}"]`)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { y: Math.round(r.y + window.scrollY), position: getComputedStyle(el).position }
  }, selector)

test('producto y búsqueda van antes que el cliente, y la ficha elegida queda en una línea (#309)', async ({ page }) => {
  const id = clave()
  const nombreCliente = `Cliente 309 ${id}`
  const clienteCreado = await crearCliente(page, nombreCliente)
  const nombreReal = clienteCreado?.name || nombreCliente

  await page.goto('/pos')
  await expect(page.getByRole('heading', { name: 'Nueva venta' })).toBeVisible()

  // Orden de trabajo: catálogo primero, cliente después.
  const productos = await posicionDe(page, 'pos-bloque-productos')
  const cliente = await posicionDe(page, 'pos-bloque-cliente')
  expect(productos, 'el bloque de productos existe').not.toBeNull()
  expect(cliente, 'el bloque de cliente existe').not.toBeNull()
  expect(productos.y).toBeLessThan(cliente.y)

  // Búsqueda y cliente siguen a mano (el buscador se ve antes en la página).
  await expect(page.getByPlaceholder('Buscar producto…')).toBeVisible()
  const campoCliente = page.getByLabel('Nombre, teléfono, CI o RUC del cliente')
  // Nombre exacto y único: la ficha se liga sola y el bloque se colapsa.
  await campoCliente.fill(nombreReal)
  const elegido = page.getByTestId('cliente-elegido')
  await expect(elegido).toBeVisible({ timeout: 15_000 })
  await expect(elegido.getByTestId('cliente-elegido-nombre')).toHaveText(nombreReal)
  await expect(page.getByLabel('Nombre, teléfono, CI o RUC del cliente')).toHaveCount(0)

  // «Editar datos» vuelve al formulario completo.
  await elegido.getByRole('button', { name: 'Editar datos' }).click()
  await expect(page.getByLabel('Nombre, teléfono, CI o RUC del cliente')).toBeVisible()
})

test('el carrito queda fijo a la derecha y el total vive una sola vez (#309)', async ({ page }) => {
  const id = clave()
  const nombre = `Producto 309 ${id}`
  const { productId } = await crearProducto(page, { nombre, stock: 5 })
  try {
    await page.goto('/pos')
    await page.getByLabel('Nombre, teléfono, CI o RUC del cliente').fill(`Cliente carrito ${id}`)
    await agregarProducto(page, nombre)

    // Carrito fijo en escritorio.
    const carrito = await posicionDe(page, '#pos-resumen-venta')
    expect(carrito.position, 'el carrito es sticky en escritorio').toBe('sticky')

    // El total (una sola vez) está en el carrito y no se repite en la franja.
    const total = page.getByTestId('carrito-total')
    await expect(total).toHaveText('Gs 90.000')
    await expect(page.getByTestId('resumen-compra')).not.toContainText('Gs 90.000')

    // Sigue a la vista al deslizar.
    await page.evaluate(() => window.scrollTo(0, 800))
    await expect(page.getByTestId('carrito-total')).toBeVisible()
  } finally {
    await borrarProducto(page, productId)
  }
})

test('celular: el Total y la acción principal quedan fijos abajo (#309)', async ({ page }) => {
  const id = clave()
  const nombre = `Producto 309 movil ${id}`
  const { productId } = await crearProducto(page, { nombre, stock: 3 })
  try {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/pos')
    await page.getByLabel('Nombre, teléfono, CI o RUC del cliente').fill(`Cliente movil ${id}`)
    await agregarProducto(page, nombre)

    const barra = page.getByTestId('pos-barra-accion')
    await expect(barra).toBeVisible()
    expect(await barra.evaluate((el) => getComputedStyle(el).position)).toBe('fixed')
    await expect(barra.getByTestId('barra-total')).toHaveText('Gs 90.000')
    await expect(barra.getByRole('button', { name: /Guardar pedido|Crear pedido|Confirmar venta/ })).toBeVisible()
    await expect(barra.getByRole('button', { name: /^Carrito/ })).toBeVisible()
    // La barra superior con el total (duplicado) ya no existe.
    await expect(page.getByTestId('carrito-barra')).toHaveCount(0)

    const antes = await barra.boundingBox()
    await page.evaluate(() => window.scrollTo(0, 900))
    const despues = await barra.boundingBox()
    expect(Math.round(despues.y)).toBe(Math.round(antes.y))
  } finally {
    await borrarProducto(page, productId)
  }
})

test('gift cards, analytics y ventas suspendidas viven en «Más» (#309)', async ({ page }) => {
  await page.goto('/pos')
  await expect(page.getByRole('heading', { name: 'Nueva venta' })).toBeVisible()

  // No están sueltas en la barra del módulo.
  for (const label of ['Gift cards', 'Analytics', 'Ventas suspendidas']) {
    await expect(page.getByRole('button', { name: label, exact: true })).toHaveCount(0)
  }

  await page.getByTestId('pos-mas').click()
  const menu = page.getByRole('menu', { name: 'Herramientas de la venta' })
  for (const label of ['Gift cards', 'Analytics', 'Ventas suspendidas']) {
    await expect(menu.getByRole('menuitem', { name: label, exact: true })).toBeVisible()
  }

  await menu.getByRole('menuitem', { name: 'Gift cards' }).click()
  await expect(page.getByRole('dialog').filter({ hasText: /Gift card/i }).first()).toBeVisible()
  await page.keyboard.press('Escape')

  await page.getByTestId('pos-mas').click()
  await page.getByRole('menu', { name: 'Herramientas de la venta' }).getByRole('menuitem', { name: 'Ventas suspendidas' }).click()
  await expect(page.getByRole('dialog', { name: 'Ventas suspendidas' })).toBeVisible()
})

test('una línea sobre pedido puede quedar en tránsito con reserva anticipada (#309)', async ({ page }) => {
  const id = clave()
  const nombre = `Producto transito ${id}`
  const cliente = `Cliente transito ${id}`
  const { productId } = await crearProducto(page, { nombre, stock: 0 })
  try {
    await page.goto('/pos')
    await page.getByLabel('Nombre, teléfono, CI o RUC del cliente').fill(cliente)
    await agregarProducto(page, nombre)

    // La guía avisa que falta stock y ofrece la salida con reserva anticipada.
    const guia = page.getByTestId('guia-venta')
    await expect(guia).toBeVisible()
    await guia.getByRole('button', { name: 'Llega en tránsito' }).click()

    const fila = page.locator('#pos-resumen-venta [data-estado="en-transito"]')
    await expect(fila).toHaveCount(1)
    await expect(fila.getByText('En tránsito')).toBeVisible()

    // El pedido viaja marcado (backorder + reserva anticipada) y no descuenta stock.
    const pedido = page.waitForRequest((req) => req.url().endsWith('/api/orders') && req.method() === 'POST')
    await page.getByRole('button', { name: /^Crear pedido sin pago/ }).click()
    const cuerpo = JSON.parse((await pedido).postData() || '{}')
    expect(cuerpo.items?.[0]?.backorder).toBe(true)
    expect(cuerpo.items?.[0]?.enTransito).toBe(true)
    expect(cuerpo.items?.[0]?.asignacionAnticipada).toBe(true)
    await expect(page.getByRole('status').filter({ hasText: 'Venta registrada correctamente.' })).toBeVisible({ timeout: 20_000 })

    const orden = await page.evaluate(async ({ api, cliente }) => {
      const filas = await fetch(`${api}/api/orders`, { credentials: 'include' }).then(r => r.json())
      return (Array.isArray(filas) ? filas : []).find(o => o.customer?.name === cliente) || null
    }, { api: API, cliente })
    expect(Number(orden?.items?.[0]?.stockPending || 0)).toBe(1)
  } finally {
    await borrarProducto(page, productId)
  }
})

test('guardar e imprimir dejan confirmación visible (#309)', async ({ page }) => {
  const id = clave()
  const nombre = `Producto feedback ${id}`
  const cliente = `Cliente feedback ${id}`
  const { productId } = await crearProducto(page, { nombre, stock: 2 })
  try {
    await page.goto('/pos')
    await page.getByLabel('Nombre, teléfono, CI o RUC del cliente').fill(cliente)
    await agregarProducto(page, nombre)
    await page.getByRole('button', { name: /^Crear pedido sin pago/ }).click()

    // Guardar: confirmación visible.
    await expect(page.getByRole('status').filter({ hasText: 'Venta registrada correctamente.' })).toBeVisible({ timeout: 20_000 })

    // Imprimir: al abrir el comprobante queda el estado visible del toast.
    await page.getByRole('button', { name: 'Imprimir comprobante' }).click()
    await expect(page.getByText('Comprobante abierto')).toBeVisible()
  } finally {
    await borrarProducto(page, productId)
  }
})
