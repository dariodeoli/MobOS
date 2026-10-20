// #309 · POS: orden de trabajo, densidad y feedback (auditoría del demo v1.0.209).
// - Producto y búsqueda antes que el cliente; con ficha elegida el cliente se
//   lee en una línea.
// - Carrito fijo en la columna derecha (escritorio) y Total + acción principal
//   fijos abajo (celular).
// - El total no se repite: vive una sola vez, en el carrito.
// - Gift cards y Ventas suspendidas son botones de la barra (sin «Más» ni Analytics).
// - Feedback visible al guardar/imprimir/enviar.
// - Soporte: una línea sobre pedido puede quedar «en tránsito» (reserva
//   anticipada del lote que ingresa; la conciliación la hace Inventario).
// Los hallazgos de otros dominios se reportan, no se corrigen acá.
import { test, expect } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'
import { ensureCobro } from './helpers/ensure-cobro.js'

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

test('cliente y catálogo están separados, y la ficha elegida queda compacta (#309)', async ({ page }) => {
  const id = clave()
  const nombreCliente = `Cliente 309 ${id}`
  const clienteCreado = await crearCliente(page, nombreCliente)
  const nombreReal = clienteCreado?.name || nombreCliente

  await page.goto('/pos')
  await expect(page.getByRole('region', { name: 'Nueva venta' })).toBeVisible()

  // El catálogo precede a la columna de venta; ambos bloques siguen accesibles.
  await expect(page.getByTestId('pos-bloque-productos')).toBeVisible()
  await expect(page.getByTestId('pos-bloque-cliente')).toBeVisible()
  const catalogoPrimero = await page.evaluate(() => {
    const a = document.querySelector('[data-testid="pos-bloque-productos"]')
    const b = document.querySelector('[data-testid="pos-bloque-cliente"]')
    return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
  })
  expect(catalogoPrimero, 'el catálogo precede a la columna de venta').toBe(true)

  // Búsqueda y cliente siguen a mano (el buscador se ve antes en la página).
  await expect(page.getByPlaceholder('Buscar producto…')).toBeVisible()
  const campoCliente = page.getByLabel('Nombre, teléfono, CI o RUC del cliente')
  // La búsqueda parcial exige elegir la ficha explícitamente.
  await campoCliente.fill(nombreReal.slice(0, -1))
  await page.getByRole('button', { name: new RegExp(nombreReal) }).click()
  const elegido = page.getByTestId('cliente-elegido')
  await expect(elegido).toBeVisible({ timeout: 15_000 })
  await expect(elegido.getByTestId('cliente-elegido-nombre')).toHaveText(nombreReal)
  await expect.poll(() => page.evaluate(async () => {
    const { contextoActual } = await import('/src/lib/storage.js')
    const { leerCarrito } = await import('/src/lib/posCart.js')
    const c = contextoActual()
    return leerCarrito(c.empresaId, c.sucursalId, c.userId)?.customer?.id
  })).toBe(clienteCreado.id)
  await expect(page.getByLabel('Nombre, teléfono, CI o RUC del cliente')).toHaveCount(0)

  // «Editar datos» vuelve al formulario completo.
  await page.getByRole('button', { name: 'Editar datos del cliente', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Datos del cliente' })).toBeVisible()
  await expect(page.getByTestId('confirmar-cliente')).toBeVisible()
})

test('la columna de venta crece con el documento y el total vive una sola vez (#309)', async ({ page }) => {
  const id = clave()
  const nombre = `Producto 309 ${id}`
  const { productId } = await crearProducto(page, { nombre, stock: 5 })
  try {
    await page.goto('/pos')
    await page.getByLabel('Nombre, teléfono, CI o RUC del cliente').fill(`Cliente carrito ${id}`)
    await agregarProducto(page, nombre)

    // El documento desplaza el ticket completo; la columna no crea mini scroll.
    const columna = page.getByTestId('pos-columna-venta')
    expect(await columna.evaluate(el => el.scrollHeight <= el.clientHeight + 1)).toBe(true)
    expect(await columna.evaluate(el => getComputedStyle(el).overflowY)).toBe('visible')
    expect((await posicionDe(page, '#pos-resumen-venta')).position, 'el carrito no se pega solo sobre el cobro').not.toBe('sticky')

    // El total (una sola vez) está en el carrito y no se repite en la franja.
    const total = page.getByTestId('carrito-total')
    await expect(total).toHaveText('Gs 90.000')
    const estaVenta = page.getByTestId('resumen-compra').locator(':scope > div').first()
    await expect(estaVenta).toContainText('Esta venta')
    await expect(estaVenta).toContainText('1 producto · 1 unidad')
    await expect(estaVenta).not.toContainText('Gs 90.000')
    // Ni el cobro repite el Total: `cobro-total` es la misma fila del carrito.
    await expect(page.getByTestId('cobro-total')).toHaveCount(1)
    await expect(page.getByTestId('pos-tiles-resumen')).not.toContainText('Total')

    // Sigue a la vista al deslizar.
    await page.evaluate(() => window.scrollTo(0, 800))
    await page.getByTestId('carrito-total').scrollIntoViewIfNeeded()
    await expect(page.getByTestId('carrito-total')).toBeInViewport()
  } finally {
    await borrarProducto(page, productId)
  }
})

test('celular: el Total y el carrito quedan fijos abajo (#309, #429)', async ({ page }) => {
  const id = clave()
  const nombre = `Producto 309 movil ${id}`
  const { productId } = await crearProducto(page, { nombre, stock: 3 })
  try {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/pos')
    // #429: en celular el cliente se elige desde la acción «Agregar cliente» (hoja).
    await page.getByTestId('accion-cliente').click()
    await page.getByLabel('Nombre, teléfono, CI o RUC del cliente').fill(`Cliente movil ${id}`)
    await page.getByTestId('hoja-cliente').getByRole('button', { name: 'Listo' }).click()
    const buscar = page.getByPlaceholder('Buscar producto…')
    await buscar.fill(nombre)
    const tarjeta = page.getByRole('button', { name: new RegExp(nombre) }).first()
    await expect(tarjeta).toBeVisible({ timeout: 15_000 })
    await tarjeta.click()

    const barra = page.getByTestId('pos-barra-carrito')
    await expect(barra).toBeVisible()
    expect(await barra.evaluate((el) => getComputedStyle(el).position)).toBe('fixed')
    await expect(barra.getByTestId('barra-total')).toHaveText('Gs 90.000')
    await expect(barra.getByTestId('barra-cantidad')).toHaveText('1 artículo')
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

test('gift cards y ventas suspendidas son botones de la barra; Analytics ya no está en el POS (#309)', async ({ page }) => {
  await page.goto('/pos')
  await expect(page.getByRole('region', { name: 'Nueva venta' })).toBeVisible()

  // «Más» ya no existe y Analytics no tiene entrada en el POS.
  await expect(page.getByTestId('pos-mas')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Analytics', exact: true })).toHaveCount(0)
  for (const label of ['Gift cards', 'Ventas suspendidas']) {
    await expect(page.getByRole('button', { name: label, exact: true })).toBeVisible()
  }

  await page.getByRole('button', { name: 'Gift cards', exact: true }).click()
  await expect(page.getByRole('dialog').filter({ hasText: /Gift card/i }).first()).toBeVisible()
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Ventas suspendidas', exact: true }).click()
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
    await ensureCobro(page)
    const guia = page.getByTestId('guia-venta')
    await expect(guia).toBeVisible()
    await guia.getByRole('button', { name: 'Llega en tránsito' }).click()

    const fila = page.locator('#pos-resumen-venta [data-estado="en-transito"]')
    await expect(fila).toHaveCount(1)
    await page.getByTestId('carrito-editar').click()
    await expect(fila.getByText('En tránsito')).toBeVisible()

    // El pedido viaja marcado (backorder + reserva anticipada) y no descuenta stock.
    const pedido = page.waitForRequest((req) => req.url().endsWith('/api/orders') && req.method() === 'POST')
    await ensureCobro(page)
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
    await ensureCobro(page)
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
