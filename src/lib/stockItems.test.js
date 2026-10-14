import test from 'node:test'
import assert from 'node:assert/strict'
import {
  columnaCostoVisible,
  filasEtiquetasDeItems,
  identificadorDeItem,
  miles,
  modeloDeItem,
  paramsStockItems,
  textoEstadoItem,
  textoMostrandoStock,
  unidadDeItem,
} from './stockItems.js'
import { listarStockItemsDemo, tipoDeCategoria } from './demo/stockItems.js'
import { etiquetasDeFilasStock, EtiquetasStockError } from './printing/etiquetasStock.js'

const unidad = (n, extra = {}) => ({
  id: `u${n}`, kind: 'unit', stockKind: 'EQUIPO', productId: 'p1', sku: 'IP15', model: 'iPhone 15 128GB Negro', name: 'iPhone 15',
  serial: `3569${String(n).padStart(11, '0')}`, batteryHealth: 92, supplierId: 's1', supplierName: 'Mayorista', costPyg: 5248700,
  status: 'disponible', quantity: 1, branchId: 'b1', branchName: 'Casa Central', locationId: 'l1', locationName: 'Piso de venta',
  createdAt: `2026-10-${String(10 + (n % 10)).padStart(2, '0')}T10:00:00.000Z`, soldAt: null, ...extra,
})
const accesorio = (extra = {}) => ({
  id: 'a1', kind: 'product', stockKind: 'ACCESORIO', productId: 'a1', sku: 'FUN-15', model: '', name: 'Funda iPhone 15', serial: null,
  batteryHealth: null, supplierId: null, supplierName: null, costPyg: 15000, status: 'disponible', quantity: 12,
  branchId: 'b1', branchName: 'Casa Central', locationId: null, locationName: null, createdAt: '2026-10-01T10:00:00.000Z', soldAt: null, ...extra,
})

test('miles y el contador «Mostrando X de Y» usan punto de millar', () => {
  assert.equal(miles(1234), '1.234')
  assert.equal(miles(50), '50')
  assert.equal(miles(1234567), '1.234.567')
  assert.equal(textoMostrandoStock(50, 1234), 'Mostrando 50 de 1.234')
  // El total nunca queda por debajo de lo mostrado (totales viejos tras una alta).
  assert.equal(textoMostrandoStock(60, 50), 'Mostrando 60 de 60')
})

test('el estado de un accesorio dice cuántos hay; el de una unidad, su estado', () => {
  assert.equal(textoEstadoItem(accesorio()), '12 disponibles')
  assert.equal(textoEstadoItem(accesorio({ quantity: 1 })), '1 disponible')
  assert.equal(textoEstadoItem(accesorio({ status: 'vendido', quantity: 3 })), '3 vendidos')
  assert.equal(textoEstadoItem(unidad(1)), 'Disponible')
  assert.equal(textoEstadoItem(unidad(1, { status: 'reservado' })), 'Reservado')
  assert.equal(textoEstadoItem(unidad(1, { status: 'vendido' })), 'Vendido')
  assert.equal(textoEstadoItem(unidad(1, { status: 'defectuoso' })), 'Defectuoso')
  assert.equal(textoEstadoItem(unidad(1, { status: 'en_transito' })), 'En tránsito')
})

test('modelo e identificador: IMEI para unidades, SKU para accesorios', () => {
  assert.deepEqual(modeloDeItem(unidad(1)), { nombre: 'iPhone 15', variante: '128GB Negro' })
  assert.deepEqual(modeloDeItem(unidad(1, { model: 'iPhone 15' })), { nombre: 'iPhone 15', variante: '' })
  assert.deepEqual(modeloDeItem(unidad(1, { model: '128GB Negro' })), { nombre: 'iPhone 15', variante: '128GB Negro' })
  assert.equal(identificadorDeItem(unidad(1)), '356900000000001')
  assert.equal(identificadorDeItem(accesorio()), 'FUN-15')
})

test('unidadDeItem conserva el serial completo y traduce el estado para las acciones', () => {
  const item = unidad(7, { status: 'reservado' })
  const forma = unidadDeItem(item, [{ id: 'p1', precioVenta: 6500000 }])
  assert.equal(forma.serial, item.serial)
  assert.equal(forma.status, 'RESERVED')
  assert.equal(forma.product.pricePyg, 6500000)
  assert.equal(forma.location.name, 'Piso de venta')
  assert.equal(unidadDeItem(unidad(1, { status: 'defectuoso' })).status, 'DEFECTIVE')
  assert.equal(unidadDeItem(unidad(1, { status: 'en_transito' })).status, 'IN_TRANSIT')
})

test('N filas seleccionadas imprimen N etiquetas y el costo nunca viaja', () => {
  const items = [unidad(1), unidad(2), unidad(3), accesorio()]
  const filas = filasEtiquetasDeItems(items, [{ id: 'a1', precioVenta: 45000 }])
  assert.equal(filas.length, 4)
  for (const fila of filas) {
    assert.ok(!('costPyg' in fila))
    assert.ok(!JSON.stringify(fila).includes('5248700'))
  }
  const { trabajos, total } = etiquetasDeFilasStock(filas, { ancho: 80, base: 'https://app.test' })
  assert.equal(total, 4)
  assert.equal(trabajos.length, 2, 'unidades y accesorios salen en trabajos separados')
  assert.equal(trabajos.find((t) => t.tipo === 'unidad').etiquetas, 3)
  assert.equal(trabajos.find((t) => t.tipo === 'producto').etiquetas, 1)
  // Solo unidades: un trabajo con N etiquetas.
  const soloUnidades = etiquetasDeFilasStock(filasEtiquetasDeItems([unidad(1), unidad(2)]), { base: 'https://app.test' })
  assert.equal(soloUnidades.total, 2)
  assert.equal(soloUnidades.trabajos.length, 1)
})

test('una selección vacía lanza el error de etiquetas tal cual', () => {
  assert.throws(() => etiquetasDeFilasStock(filasEtiquetasDeItems([])), (error) => error instanceof EtiquetasStockError && /Seleccioná al menos una fila/.test(error.message))
})

test('paramsStockItems arma los filtros de la API sin enviar vacíos', () => {
  const params = paramsStockItems({ tipo: 'EQUIPO', estado: 'vendido', sucursal: 'b1', proveedor: 's1', q: ' iphone ', desde: '2026-10-01' }, { limit: 50, cursor: 'abc' })
  assert.equal(params.get('stockKind'), 'EQUIPO')
  assert.equal(params.get('status'), 'vendido')
  assert.equal(params.get('branchId'), 'b1')
  assert.equal(params.get('supplierId'), 's1')
  assert.equal(params.get('q'), 'iphone')
  assert.equal(params.get('from'), '2026-10-01')
  assert.equal(params.get('limit'), '50')
  assert.equal(params.get('cursor'), 'abc')
  const vacio = paramsStockItems({}, { limit: 50 })
  assert.deepEqual([...vacio.keys()], ['limit'])
})

test('la columna de costo se oculta cuando la API devuelve null para el rol', () => {
  const sinCosto = [unidad(1, { costPyg: null, supplierName: null, supplierId: null }), accesorio({ costPyg: null })]
  assert.equal(columnaCostoVisible({ rolVeCosto: false, items: sinCosto }), false)
  assert.equal(columnaCostoVisible({ rolVeCosto: false, items: [unidad(1)] }), true)
  // Un rol con permiso la ve aunque todos los costos estén pendientes.
  assert.equal(columnaCostoVisible({ rolVeCosto: true, items: sinCosto }), true)
  // Un costo en cero es un costo cargado a propósito.
  assert.equal(columnaCostoVisible({ rolVeCosto: false, items: [unidad(1, { costPyg: 0 })] }), true)
})

// ── Adaptador demo ───────────────────────────────────────────────────────────
const unidadesDemo = Array.from({ length: 120 }, (_, i) => ({
  id: `d${i}`, serial: `DEMO${String(i).padStart(10, '0')}`, status: i % 10 === 0 ? 'SOLD' : i % 7 === 0 ? 'RESERVED' : 'AVAILABLE',
  productId: 'p1', product: { id: 'p1', name: 'iPhone 15', sku: 'IP15', capacity: '128GB' }, branchId: i % 2 ? 'b1' : 'b2',
  branch: { id: i % 2 ? 'b1' : 'b2', name: i % 2 ? 'Central' : 'Villa Morra' }, supplier: { id: 's1', name: 'Mayorista' }, supplierName: 'Mayorista',
  costPyg: 5000000, batteryHealth: 90, createdAt: new Date(Date.UTC(2026, 9, 1) + i * 3600_000).toISOString(),
  ...(i % 10 === 0 ? { updatedAt: new Date(Date.UTC(2026, 9, 5) + i * 3600_000).toISOString() } : {}),
}))
const fuente = {
  units: unidadesDemo,
  removed: [{ ...unidadesDemo[0], id: 'r0', removedAt: '2026-10-02T00:00:00.000Z' }],
  products: [{ id: 'a1', nombre: 'Funda iPhone 15', categoria: 'Accesorios', sku: 'FUN-15', stock: 12, precioCosto: 15000, activo: true }, { id: 'p1', nombre: 'iPhone 15', categoria: 'Celulares', stock: 0 }],
  branches: [{ id: 'b1', name: 'Central' }],
}

test('demo: pagina por cursor y entrega totales con los mismos filtros', () => {
  const primera = listarStockItemsDemo({ limit: '50' }, fuente)
  assert.equal(primera.items.length, 50)
  assert.equal(primera.hasMore, true)
  assert.ok(primera.nextCursor)
  assert.equal(primera.totals.total, 121, '120 unidades + 1 accesorio')
  assert.equal(primera.totals.byRowKind.product, 1)
  const segunda = listarStockItemsDemo({ limit: '50', cursor: primera.nextCursor }, fuente)
  assert.equal(segunda.items.length, 50)
  const tercera = listarStockItemsDemo({ limit: '50', cursor: segunda.nextCursor }, fuente)
  assert.equal(tercera.items.length, 21)
  assert.equal(tercera.hasMore, false)
  assert.equal(tercera.nextCursor, null)
  const ids = new Set([...primera.items, ...segunda.items, ...tercera.items].map((item) => item.id))
  assert.equal(ids.size, 121, 'sin repetidos entre páginas')
})

test('demo: filtros de estado, tipo, sucursal y búsqueda', () => {
  const vendidos = listarStockItemsDemo({ status: 'vendido', limit: '200' }, fuente)
  assert.ok(vendidos.items.length > 0 && vendidos.items.every((item) => item.status === 'vendido'))
  assert.ok(vendidos.items.every((item) => item.soldAt), 'los vendidos traen fecha de venta')
  const accesorios = listarStockItemsDemo({ stockKind: 'ACCESORIO' }, fuente)
  assert.equal(accesorios.items.length, 1)
  assert.equal(accesorios.items[0].quantity, 12)
  assert.equal(accesorios.items[0].serial, null)
  const central = listarStockItemsDemo({ branchId: 'b1', stockKind: 'EQUIPO', limit: '200' }, fuente)
  assert.ok(central.items.every((item) => item.branchId === 'b1'))
  const busqueda = listarStockItemsDemo({ q: 'DEMO0000000042' }, fuente)
  assert.equal(busqueda.items.length, 1)
  const eliminados = listarStockItemsDemo({ status: 'eliminado' }, fuente)
  assert.equal(eliminados.items.length, 1)
  assert.equal(eliminados.items[0].status, 'eliminado')
})

test('demo: tipo de categoría y costo en guaraníes completos', () => {
  assert.equal(tipoDeCategoria('Accesorios'), 'ACCESORIO')
  assert.equal(tipoDeCategoria('Celulares'), 'EQUIPO')
  assert.equal(tipoDeCategoria('Pantallas'), 'REPUESTO')
  assert.equal(tipoDeCategoria('Soporte técnico'), 'OTRO')
  const [item] = listarStockItemsDemo({ q: 'DEMO0000000001' }, fuente).items
  assert.equal(item.costPyg, 5000000)
})

// ── Orden de la lista y modal de ubicación (paridad con el inventario original) ──
test('ordenarItemsStock aplica los 9 criterios sin mutar la lista', async () => {
  const { ordenarItemsStock, ordenesStockVisibles, ORDENES_STOCK } = await import('./stockItems.js')
  const filas = [
    unidad(1, { id: 'a', name: 'iPhone 13', model: '13 128 Negro', condition: 'USED', costPyg: 3000000 }),
    unidad(2, { id: 'b', name: 'iPhone 17', model: '17 256 Azul', condition: 'NEW', costPyg: 9000000 }),
    unidad(3, { id: 'c', name: 'Galaxy S24', model: 'S24 256', condition: 'USED', costPyg: 6000000 }),
  ]
  const copia = filas.map((fila) => fila.id)
  const ids = (orden, opciones) => ordenarItemsStock(filas, orden, opciones).map((fila) => fila.id)
  assert.equal(ORDENES_STOCK.length, 9)
  assert.deepEqual(ids('recientes'), ['a', 'b', 'c'])
  assert.deepEqual(ids('modelo-az'), ['c', 'a', 'b'])
  assert.deepEqual(ids('modelo-za'), ['b', 'a', 'c'])
  assert.deepEqual(ids('nuevos'), ['b', 'c', 'a'])
  assert.deepEqual(ids('semis'), ['c', 'a', 'b'])
  assert.deepEqual(ids('modelo-natural'), ['c', 'b', 'a']) // S24 -> 24, 17, 13
  assert.deepEqual(ids('mezclado'), ['c', 'a', 'b'])
  assert.deepEqual(ids('costo-mayor'), ['b', 'c', 'a'])
  assert.deepEqual(ids('costo-menor'), ['a', 'c', 'b'])
  // Sin permiso de costos los criterios de costo no reordenan ni se ofrecen.
  assert.deepEqual(ids('costo-mayor', { rolVeCosto: false }), ['a', 'b', 'c'])
  assert.equal(ordenesStockVisibles(false).some(([id]) => id.startsWith('costo')), false)
  assert.equal(ordenesStockVisibles(true).length, 9)
  assert.deepEqual(filas.map((fila) => fila.id), copia)
})

test('Stock renderiza el modal de ubicación y el selector de orden', async () => {
  const { readFileSync } = await import('node:fs')
  const leer = (ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8')
  const acciones = leer('../components/stock/AccionesUnidad.jsx')
  assert.match(acciones, /open=\{locationForm !== null\}/)
  assert.match(acciones, /onSubmit=\{saveLocation\}/)
  assert.match(acciones, /onClose=\{\(\) => setLocationForm\(null\)\}/)
  assert.match(acciones, /Editar ubicación/)
  assert.match(acciones, /Crear ubicación/)
  assert.match(acciones, /aria-label="Color de la ubicación"/)
  const filtros = leer('../components/stock/FiltrosStock.jsx')
  assert.match(filtros, /aria-label="Orden del inventario"/)
  assert.match(leer('../components/stock/BarraStock.jsx'), /onOrden=\{recordarOrden\}/)
  const lista = leer('../components/stock/ListaStock.jsx')
  assert.match(lista, /ordenarItemsStock\(stock\.items, orden/)
  assert.match(lista, /orden aplicado a lo cargado/)
})
