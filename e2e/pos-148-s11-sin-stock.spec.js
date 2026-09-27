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
  await expect(page.getByRole('heading', { name: /^(POS|Nueva venta)$/, level: 1 })).toBeVisible()
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
    // La validación del POS frena antes de enviar, con su propio mensaje.
    const alerta = page.getByRole('alert').filter({ hasText: 'Falta elegir el IMEI/serial' })
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
// #263: el selector busca por producto (no por texto) y ofrece la unidad real.
// Antes la búsqueda por SKU/nombre se topeaba con 500 unidades de otros
// productos que contenían ese texto: el selector quedaba vacío, la guía no pedía
// IMEI y el servidor rechazaba la venta («Seleccioná el IMEI/serial exacto…»).
test('la venta serializada cierra aunque haya 500 unidades con el mismo texto (#263)', async ({ page }) => {
  const id = clave()
  const nombre = `Equipo cap QA ${id}`
  const cliente = `Cliente cap QA ${id}`
  const sku = `ZZ-QA263-CAP-${id}`
  const imei = `35${Date.now().toString().slice(-13)}`
  const baseSerials = Number(`359${String(Date.now()).slice(-12)}`)
  await page.goto('/pos')
  const { productId } = await page.evaluate(async ({ api, nombre, sku, imei, branchId }) => {
    const respuesta = await fetch(`${api}/api/products`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sku, name: nombre, category: 'Celulares', pricePyg: 3000000, costPyg: 2200000, stock: 1, branchId, imei }) })
    const datos = await respuesta.json().catch(() => null)
    if (!respuesta.ok) throw new Error(datos?.message || `products: ${respuesta.status}`)
    return { productId: datos.id }
  }, { api: API, nombre, sku, imei, branchId: SEED.branchId })
  let senueloId = ''
  try {
    // Producto señuelo cuyo SKU contiene el del producto real, con 500 unidades
    // disponibles más nuevas: la búsqueda por texto las devuelve primero y
    // dejaba afuera la unidad real (tope de la API).
    senueloId = await page.evaluate(async ({ api, sku, branchId, baseSerials }) => {
      const creado = await fetch(`${api}/api/products`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sku: `${sku}-R`, name: `Repuesto ${sku}`, category: 'Celulares', pricePyg: 1000, costPyg: 500, stock: 0, branchId }) })
      const datos = await creado.json().catch(() => null)
      if (!creado.ok) throw new Error(datos?.message || `products: ${creado.status}`)
      const seriales = Array.from({ length: 500 }, (_, indice) => String(baseSerials + indice).slice(0, 15))
      for (let indice = 0; indice < seriales.length; indice += 100) {
        const respuesta = await fetch(`${api}/api/inventory-units`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId: datos.id, branchId, serials: seriales.slice(indice, indice + 100), condition: 'NEW' }) })
        if (!respuesta.ok) throw new Error(`inventory-units: ${respuesta.status}`)
      }
      return datos.id
    }, { api: API, sku, branchId: SEED.branchId, baseSerials })

    await page.goto('/pos')
    await expect(page.getByRole('heading', { name: /^(POS|Nueva venta)$/, level: 1 })).toBeVisible()
    await page.getByLabel('Nombre, teléfono, CI o RUC del cliente').fill(cliente)
    await page.getByPlaceholder('Buscar producto…').fill(sku)
    const tarjeta = page.locator('button').filter({ hasText: nombre }).filter({ hasNotText: 'Repuesto' }).first()
    await expect(tarjeta).toBeVisible({ timeout: 15_000 })
    await tarjeta.click()
    await expect(page.getByText('Productos de esta venta')).toBeVisible()

    // El selector ofrece la unidad real y con ella la venta cierra.
    const guia = page.getByTestId('guia-venta')
    await expect(guia).toContainText('Seleccioná el IMEI/serial exacto')
    await guia.getByRole('button', { name: 'Elegir unidad' }).click()
    await expect(page.getByText('Elegir IMEI de esta venta')).toBeVisible()
    await expect(page.getByTitle(imei)).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: 'Reservar este' }).click()
    await expect(page.getByRole('button', { name: 'Cambiar IMEI' })).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: 'Listo' }).click()

    await page.getByRole('button', { name: /^Crear pedido sin pago/ }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Venta registrada correctamente.' })).toBeVisible({ timeout: 20_000 })
    const vendida = await page.evaluate(async ({ api, serial }) => {
      const filas = await fetch(`${api}/api/inventory-units?q=${encodeURIComponent(serial)}`, { credentials: 'include' }).then((r) => r.json()).catch(() => [])
      return Array.isArray(filas) ? filas[0]?.status || '' : ''
    }, { api: API, serial: imei })
    expect(vendida).toBe('SOLD')
  } finally {
    await page.evaluate(async ({ api, serial, decoyId }) => {
      await fetch(`${api}/api/inventory-reservations`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'release', serials: [serial] }) }).catch(() => {})
      if (decoyId) {
        const unidades = await fetch(`${api}/api/inventory-units?productId=${encodeURIComponent(decoyId)}`, { credentials: 'include' }).then((r) => r.json()).catch(() => [])
        const ids = (Array.isArray(unidades) ? unidades : []).map((unidad) => unidad.id)
        for (let indice = 0; indice < ids.length; indice += 50) {
          await Promise.all(ids.slice(indice, indice + 50).map((id) => fetch(`${api}/api/inventory-units`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action: 'remove', reason: 'Limpieza QA #263' }) }).catch(() => {})))
        }
        await fetch(`${api}/api/products?id=${encodeURIComponent(decoyId)}`, { method: 'DELETE', credentials: 'include' }).catch(() => {})
      }
    }, { api: API, serial: imei, decoyId: senueloId })
    await borrarProducto(page, productId)
  }
})

// #263: el selector ofrece las unidades DISPONIBLES de la sucursal: una unidad
// en revisión no se lista como si se pudiera vender.
test('el selector de IMEI lista solo las unidades disponibles de la sucursal (#263)', async ({ page }) => {
  const id = clave()
  const nombre = `Equipo selector QA ${id}`
  const cliente = `Cliente selector QA ${id}`
  const imeiOk = `35${Date.now().toString().slice(-13)}`
  const imeiRevision = `35${(Date.now() + 7).toString().slice(-13)}`
  const { productId } = await crearProducto(page, { nombre, stock: 1, imei: imeiOk })
  try {
    const idRevision = await page.evaluate(async ({ api, productId, serial, branchId }) => {
      const respuesta = await fetch(`${api}/api/inventory-units`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId, branchId, serial, condition: 'USED' }) })
      const datos = await respuesta.json().catch(() => null)
      if (!respuesta.ok) throw new Error(`inventory-units: ${respuesta.status}`)
      await fetch(`${api}/api/inventory-units`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: datos.id, action: 'adjust', status: 'DEFECTIVE', reason: 'Limpieza QA #263' }) })
      return datos.id
    }, { api: API, productId, serial: imeiRevision, branchId: SEED.branchId })

    await agregarAlCarrito(page, cliente, nombre)
    const guia = page.getByTestId('guia-venta')
    await expect(guia).toContainText('Seleccioná el IMEI/serial exacto')
    await guia.getByRole('button', { name: 'Elegir unidad' }).click()
    await expect(page.getByText('Elegir IMEI de esta venta')).toBeVisible()
    await expect(page.getByTitle(imeiOk)).toBeVisible()
    await expect(page.getByTitle(imeiRevision)).toHaveCount(0)
    await page.getByRole('button', { name: 'Listo' }).click()
  } finally {
    await page.evaluate(async ({ api, seriales, ids }) => {
      for (const serial of seriales) {
        await fetch(`${api}/api/inventory-reservations`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'release', serials: [serial] }) }).catch(() => {})
      }
      for (const id of ids) {
        await fetch(`${api}/api/inventory-units`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action: 'remove', reason: 'Limpieza QA #263' }) }).catch(() => {})
      }
    }, { api: API, seriales: [imeiOk, imeiRevision], ids: [] })
    await page.evaluate(async ({ api, serial }) => {
      const unidades = await fetch(`${api}/api/inventory-units?q=${encodeURIComponent(serial)}`, { credentials: 'include' }).then((r) => r.json()).catch(() => [])
      for (const unidad of Array.isArray(unidades) ? unidades : []) {
        await fetch(`${api}/api/inventory-units`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: unidad.id, action: 'remove', reason: 'Limpieza QA #263' }) }).catch(() => {})
      }
    }, { api: API, serial: imeiOk })
    await borrarProducto(page, productId)
  }
})
