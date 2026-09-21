// Sync Inventario → Productos → POS (#157). Reproduce el caso real y fija el
// contrato de búsqueda que consume el POS: resultados con nombre, modelo,
// capacidad, precio, stock por sucursal y disponibilidad, más la identificación
// por código del escáner (IMEI/serial, SKU, MOBOS:<serial>).
import { test, expect } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'

const API = SEED.api

const marca = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`.toUpperCase()

async function api(page, ruta, opciones = {}) {
  return page.evaluate(async ({ api, ruta, opciones }) => {
    const respuesta = await fetch(`${api}/api/${ruta}`, {
      credentials: 'include',
      headers: opciones.body ? { 'Content-Type': 'application/json' } : undefined,
      ...opciones,
    })
    const datos = await respuesta.json().catch(() => null)
    return { status: respuesta.status, datos }
  }, { api: API, ruta, opciones })
}

// Crea un producto de inventario con sus unidades (como la carga rápida).
async function crearInventario(page, { marca, nombre, modelo, capacidad, color, sucursal = SEED.branchId, sucursalUnidades = sucursal, unidades = 0, seriales = [] }) {
  await page.goto('/inventario/unidades')
  return page.evaluate(async ({ api, datos }) => {
    const pedir = async (ruta, opciones = {}) => {
      const respuesta = await fetch(`${api}/api/${ruta}`, { credentials: 'include', headers: opciones.body ? { 'Content-Type': 'application/json' } : undefined, ...opciones })
      const payload = await respuesta.json().catch(() => null)
      if (!respuesta.ok) throw new Error(`${ruta}: ${payload?.message || respuesta.status}`)
      return payload
    }
    const producto = await pedir('products', { method: 'POST', body: JSON.stringify({ sku: `ZZ-SYNC-${datos.marca}`, name: datos.nombre, model: datos.modelo, capacity: datos.capacidad, color: datos.color, category: 'Celulares', pricePyg: 4200000, wholesalePricePyg: 3900000, costPyg: 3200000, stock: 0, branchId: datos.sucursal }) })
    const unidades = []
    for (let i = 0; i < datos.seriales.length; i += 1) {
      unidades.push(await pedir('inventory-units', { method: 'POST', body: JSON.stringify({ productId: producto.id, branchId: datos.sucursalUnidades, serial: datos.seriales[i] }) }))
    }
    return { productId: producto.id, unidades }
  }, { api: API, datos: { marca, nombre, modelo, capacidad, color, sucursal, sucursalUnidades, seriales } })
}

async function limpiar(page, { productId, unidades = [] }) {
  try {
    await page.evaluate(async ({ api, productId, unidades }) => {
      for (const unidad of unidades) {
        await fetch(`${api}/api/inventory-units`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: unidad.id, action: 'remove', reason: 'Limpieza del spec de sync' }) }).catch(() => {})
      }
      await fetch(`${api}/api/products?id=${encodeURIComponent(productId)}`, { method: 'DELETE', credentials: 'include' }).catch(() => {})
    }, { api: API, productId, unidades })
  } catch { /* la limpieza no puede hacer fallar el test */ }
}

test('la búsqueda encuentra por nombre, modelo, capacidad y código del escáner', async ({ page }) => {
  const id = marca()
  const serial = `ZZSYNC${id}`
  const inventario = await crearInventario(page, { marca: id, nombre: `iPhone 15 Pro Max QA ${id}`, modelo: 'iPhone 15 Pro Max', capacidad: '256 GB', color: 'Titanio', seriales: [serial] })
  try {
    const porNombre = await api(page, `products/search?q=${encodeURIComponent(`iPhone 15 Pro Max QA ${id}`)}&branchId=${SEED.branchId}`)
    expect(porNombre.status).toBe(200)
    expect(porNombre.datos.resultados.some(row => row.id === inventario.productId)).toBe(true)
    const fila = porNombre.datos.resultados.find(row => row.id === inventario.productId)
    // Los campos que muestra el POS: nombre, modelo, capacidad, precio, stock, sucursal y disponibilidad.
    expect(fila.name).toContain(`iPhone 15 Pro Max QA ${id}`)
    expect(fila.model).toBe('iPhone 15 Pro Max')
    expect(fila.capacity).toBe('256 GB')
    expect(fila.pricePyg).toBe(4200000)
    expect(fila.wholesalePricePyg).toBe(3900000)
    expect(fila.stock).toBe(1)
    expect(fila.disponible).toBe(true)
    expect(fila.agotado).toBe(false)
    expect(fila.disponibleEn.some(s => s.branchId === SEED.branchId && s.available === 1)).toBe(true)

    // Modelo y capacidad también encuentran el producto (hoy el POS filtra solo por nombre/SKU).
    const porModelo = await api(page, `products/search?q=${encodeURIComponent('iPhone 15 Pro Max')}&branchId=${SEED.branchId}`)
    expect(porModelo.datos.resultados.some(row => row.id === inventario.productId)).toBe(true)
    const porCapacidad = await api(page, `products/search?q=${encodeURIComponent('256 GB')}&branchId=${SEED.branchId}`)
    expect(porCapacidad.datos.resultados.some(row => row.id === inventario.productId)).toBe(true)

    // El escáner: serial pelado y con el prefijo que imprimen las etiquetas.
    const porSerial = await api(page, `products/search?q=${encodeURIComponent(serial)}&branchId=${SEED.branchId}`)
    expect(porSerial.datos.resultados.some(row => row.id === inventario.productId)).toBe(true)
    const exacta = porSerial.datos.resultados.find(row => row.id === inventario.productId)
    expect(exacta.coincidencia).toBe('serial')
    expect(exacta.unidad?.serial).toBe(serial)
    const porCodigo = await api(page, `products/search?q=${encodeURIComponent(`MOBOS:${serial}`)}&branchId=${SEED.branchId}`)
    expect(porCodigo.datos.resultados.some(row => row.id === inventario.productId)).toBe(true)
  } finally { await limpiar(page, inventario) }
})

test('el stock y la disponibilidad se informan por sucursal', async ({ page }) => {
  const id = marca()
  const enSucursal = await crearInventario(page, { marca: `${id}A`, nombre: `Equipo sucursal QA ${id}`, modelo: 'iPhone 14', capacidad: '128 GB', color: 'Azul', seriales: [`ZZSYNCA${id}`] })
  const enOtra = await crearInventario(page, { marca: `${id}B`, nombre: `Equipo otra sucursal QA ${id}`, modelo: 'iPhone 13', capacidad: '128 GB', color: 'Negro', seriales: [`ZZSYNCB${id}`] })
  const sinStock = await crearInventario(page, { marca: `${id}C`, nombre: `Equipo agotado QA ${id}`, modelo: 'iPhone 12', capacidad: '64 GB', color: 'Blanco' })
  try {
    const propio = await api(page, `products/search?q=${encodeURIComponent(`Equipo sucursal QA ${id}`)}&branchId=${SEED.branchId}`)
    const filaPropia = propio.datos.resultados.find(row => row.id === enSucursal.productId)
    expect(filaPropia.stock).toBe(1)
    expect(filaPropia.disponible).toBe(true)
    expect(filaPropia.agotado).toBe(false)

    // Mirado desde otra sucursal: sin stock acá, pero se informa dónde hay.
    const ajeno = await api(page, `products/search?q=${encodeURIComponent(`Equipo otra sucursal QA ${id}`)}&branchId=${SEED.branch2Id}`)
    const filaAjena = ajeno.datos.resultados.find(row => row.id === enOtra.productId)
    expect(filaAjena.stock).toBe(0)
    expect(filaAjena.agotado).toBe(true)
    expect(filaAjena.disponible).toBe(false)
    expect(filaAjena.disponibleEn.some(s => s.branchId === SEED.branchId && s.available === 1 && s.branchName)).toBe(true)

    const agotado = await api(page, `products/search?q=${encodeURIComponent(`Equipo agotado QA ${id}`)}&branchId=${SEED.branchId}`)
    const filaAgotada = agotado.datos.resultados.find(row => row.id === sinStock.productId)
    expect(filaAgotada.agotado).toBe(true)
    expect(filaAgotada.stock).toBe(0)
  } finally {
    await limpiar(page, enSucursal)
    await limpiar(page, enOtra)
    await limpiar(page, sinStock)
  }
})

test('un código desconocido no devuelve resultados y el SKU identifica el producto', async ({ page }) => {
  const id = marca()
  const inventario = await crearInventario(page, { marca: id, nombre: `SKU QA ${id}`, modelo: 'iPhone 11', capacidad: '64 GB', color: 'Rojo' })
  try {
    const porSku = await api(page, `products/search?q=${encodeURIComponent(`ZZ-SYNC-${id}`)}&branchId=${SEED.branchId}`)
    const fila = porSku.datos.resultados.find(row => row.id === inventario.productId)
    expect(fila?.coincidencia).toBe('sku')

    const desconocido = await api(page, `products/search?q=${encodeURIComponent(`NO-EXISTE-${id}`)}&branchId=${SEED.branchId}`)
    expect(desconocido.status).toBe(200)
    expect(desconocido.datos.resultados).toEqual([])
  } finally { await limpiar(page, inventario) }
})
