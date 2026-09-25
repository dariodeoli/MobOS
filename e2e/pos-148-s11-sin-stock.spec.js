// #148 §11 · Venta sin stock / sin IMEI.
// Antes: con un producto agotado (o sin IMEI) el POS no dejaba crear la orden y
// el error era el genérico «Stock insuficiente»; marcar «vender sin IMEI» no
// alcanzaba. Ahora: la línea marcada «sobre pedido» crea el pedido sin descontar
// stock (queda pendiente de entrega), la guía inline dice qué falta y con qué
// resolverlo (elegir unidad / vender sin IMEI / crear pedido) y el aviso deja de
// ser el genérico. Los hallazgos de otros dominios se reportan, no se corrigen acá.
import { test, expect } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'

const API = SEED.api
const clave = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`.toUpperCase()

// Producto real de inventario. Sin `imei` nace por contador (puede nacer en 0);
// con `imei` nace serializado y con su unidad disponible.
async function crearProducto(page, { nombre, precio = 100000, stock = 0, imei }) {
  await page.goto('/pos')
  return page.evaluate(async ({ api, branchId, nombre, precio, stock, imei }) => {
    const respuesta = await fetch(`${api}/api/products`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sku: `ZZ-QA148S11-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
        name: nombre, category: 'Accesorios', pricePyg: precio, costPyg: 60000, stock, branchId,
        ...(imei ? { imei } : {}),
      }),
    })
    const datos = await respuesta.json().catch(() => null)
    if (!respuesta.ok) throw new Error(datos?.message || `products: ${respuesta.status}`)
    return { productId: datos.id }
  }, { api: API, branchId: SEED.branchId, nombre, precio, stock, imei })
}

async function borrarProducto(page, productId) {
  await page.evaluate(async ({ api, productId }) => {
    await fetch(`${api}/api/products?id=${encodeURIComponent(productId)}`, { method: 'DELETE', credentials: 'include' }).catch(() => {})
  }, { api: API, productId })
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

async function agregarAlCarrito(page, cliente, producto) {
  await page.goto('/pos')
  await expect(page.getByRole('heading', { name: 'Nueva venta' })).toBeVisible()
  await page.getByLabel('Nombre, teléfono, CI o RUC del cliente').fill(cliente)
  await page.getByPlaceholder('Buscar producto…').fill(producto)
  const card = page.getByRole('button', { name: new RegExp(producto) })
  await expect(card).toBeVisible({ timeout: 15_000 })
  await card.click()
  await expect(page.getByText('Productos de esta venta')).toBeVisible()
}

test('venta sin stock marcada «sobre pedido» crea el pedido sin descontar stock (#148 §11)', async ({ page }) => {
  const id = clave()
  const nombre = `Equipo sin stock QA ${id}`
  const cliente = `Cliente sobre pedido QA ${id}`
  const { productId } = await crearProducto(page, { nombre, stock: 0 })
  try {
    await agregarAlCarrito(page, cliente, nombre)

    // La guía inline explica el bloqueo y trae la acción para destrabarlo.
    const guia = page.getByTestId('guia-venta')
    await expect(guia).toBeVisible()
    await expect(guia).toContainText('sobre pedido')
    await guia.getByRole('button', { name: 'Sobre pedido' }).click()

    await expect(guia).toHaveCount(0)
    await expect(page.locator('[data-estado="sobre-pedido"]')).toHaveCount(1)

    await page.getByRole('button', { name: /^Crear pedido sin pago/ }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Venta registrada correctamente.' })).toBeVisible({ timeout: 20_000 })

    const orden = await pedidoDe(page, cliente)
    expect(orden, 'el pedido queda registrado').toBeTruthy()
    expect(Number(orden.items?.[0]?.stockPending || 0), 'la línea queda pendiente de stock').toBe(1)
    expect(Number(orden.items?.[0]?.serialsPending || 0), 'un producto sin serial no pide IMEI').toBe(0)
    expect(await stockDe(page, productId), 'la venta sobre pedido no descuenta stock').toBe(0)
  } finally {
    await borrarProducto(page, productId)
  }
})

test('sin marcar, el aviso es claro (no el genérico) y la guía queda a la vista (#148 §11)', async ({ page }) => {
  const id = clave()
  const nombre = `Equipo sin stock QA ${id}`
  const cliente = `Cliente sin marcar QA ${id}`
  const { productId } = await crearProducto(page, { nombre, stock: 0 })
  try {
    await agregarAlCarrito(page, cliente, nombre)
    await page.getByRole('button', { name: /^Crear pedido sin pago/ }).click()

    const alerta = page.getByRole('alert').filter({ hasText: 'Sin stock de' })
    await expect(alerta).toBeVisible()
    await expect(alerta).toContainText('marcalo como «sobre pedido»')
    await expect(alerta).not.toContainText('Stock insuficiente')
    await expect(page.getByTestId('guia-venta')).toBeVisible()
    expect(await pedidoDe(page, cliente), 'no se crea una orden a medias').toBeNull()
  } finally {
    await borrarProducto(page, productId)
  }
})

test('con unidad disponible, la guía manda a elegir el IMEI exacto (#148 §11)', async ({ page }) => {
  const id = clave()
  const nombre = `Equipo serial QA ${id}`
  const cliente = `Cliente serial QA ${id}`
  const imei = `35${Date.now().toString().slice(-13)}`
  const { productId } = await crearProducto(page, { nombre, stock: 1, imei })
  try {
    await agregarAlCarrito(page, cliente, nombre)

    const guia = page.getByTestId('guia-venta')
    await expect(guia).toBeVisible()
    await expect(guia).toContainText('Seleccioná el IMEI/serial exacto de cada equipo antes de vender.')
    await expect(page.locator('[data-estado="falta-imei"]')).toHaveCount(1)

    // Con unidades disponibles la salida es elegir la unidad (no vender sin
    // IMEI: el backend lo rechaza y la guía no debe ofrecerlo).
    const elegir = guia.getByRole('button', { name: 'Elegir unidad' })
    await expect(elegir).toBeVisible()
    await expect(guia.getByRole('button', { name: 'Vender sin IMEI' })).toHaveCount(0)
    await elegir.click()
    await expect(page.getByText('Elegir IMEI de esta venta')).toBeVisible()
    await expect(page.getByTitle(imei)).toBeVisible()
    await page.getByRole('button', { name: 'Listo' }).click()

    // Sin elegir la unidad, el aviso es claro y accionable (no el genérico).
    await page.getByRole('button', { name: /^Crear pedido sin pago/ }).click()
    const alerta = page.getByRole('alert').filter({ hasText: 'Seleccioná el IMEI/serial exacto' })
    await expect(alerta).toBeVisible()
    await expect(alerta).toContainText('sobre pedido')
    expect(await pedidoDe(page, cliente), 'no se crea una orden sin el IMEI').toBeNull()
  } finally {
    await borrarProducto(page, productId)
    // La unidad pudo quedar reservada por el picker: se libera por las dudas.
    await page.evaluate(async ({ api, imei }) => {
      await fetch(`${api}/api/inventory-reservations`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'release', serials: [imei] }) }).catch(() => {})
    }, { api: API, imei })
  }
})


