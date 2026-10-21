// Pruebas del inventario demo (#213): seed con IMEIs ficticios, estados
// variados y mutaciones session-only. Sin navegador: storage falso.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

// Fuera de la demo, demoStorage delega en localStorage: acá se simula con
// memoria para que las mutaciones sobrevivan dentro del archivo de tests.
const store = new Map()
globalThis.localStorage = {
  getItem: clave => (store.has(clave) ? store.get(clave) : null),
  setItem: (clave, valor) => store.set(clave, String(valor)),
  removeItem: clave => store.delete(clave),
}

const demo = await import('./demoInventory.js')

test('el seed demo tiene 60 unidades con seriales ficticios y estados variados', () => {
  const state = demo.demoInventorySeed()
  assert.equal(state.units.length, 62, '60 activos + 2 bajas de ejemplo')
  assert.ok(state.units.every(unit => /^35\d{13}$/.test(unit.serial)), 'IMEI de aspecto real: 15 dígitos con prefijo 35')
  assert.equal(new Set(state.units.map(unit => unit.serial)).size, 62, 'IMEI únicos')
  const estados = new Set(state.units.map(unit => unit.status))
  for (const esperado of ['AVAILABLE', 'RESERVED', 'SOLD', 'DEFECTIVE', 'IN_TRANSIT']) assert.ok(estados.has(esperado), esperado)
  assert.equal(state.locations.filter(location => location.branchId === demo.DEMO_BRANCH).length, 3)
  assert.ok(state.suppliers.length >= 2)
  assert.ok(state.units.some(unit => unit.costCurrency === 'USD' && unit.originalCost > 0), 'hay costos en USD')
  assert.ok(state.units.some(unit => unit.costCurrency === 'PYG' && unit.costPyg > 0), 'y costos en Gs')
})

test('listar filtra por búsqueda y la vista de eliminados arranca con dos bajas de ejemplo', () => {
  assert.equal(demo.listDemoUnits().length, 60)
  const encontradas = demo.listDemoUnits(demo.demoInventorySeed().units[1].serial)
  assert.equal(encontradas.length, 1)
  assert.equal(demo.listDemoUnits('', 'removed').length, 2)
})

test('crear, mover y dar de baja una unidad demo', () => {
  const creada = demo.createDemoUnit({ productId: 'demo-iphone-15-128-azul', serial: 'AUR9999TEST', branchId: demo.DEMO_BRANCH, locationId: 'demo-ubic-piso', costPyg: 1000000 })
  assert.equal(creada.status, 'AVAILABLE')
  assert.equal(creada.product.name, 'iPhone 15 128GB Azul')
  const movida = demo.updateDemoUnit({ id: creada.id, action: 'move', locationId: 'demo-ubic-deposito-2' })
  assert.equal(movida.locationId, 'demo-ubic-deposito-2')
  demo.updateDemoUnit({ id: creada.id, action: 'remove', reason: 'QA' })
  assert.equal(demo.listDemoUnits('', 'removed').length, 3)
  assert.equal(demo.listDemoUnits('AUR9999TEST').length, 0)
})

test('reservar y liberar mantiene el stock coherente', () => {
  const libre = demo.listDemoUnits().find(unit => unit.status === 'AVAILABLE')
  demo.reserveDemoUnits({ serials: [libre.serial], customerName: 'Cliente demo', hours: 2 })
  assert.ok(demo.listDemoReservations().some(unit => unit.serial === libre.serial))
  demo.releaseDemoReservations([libre.serial])
  assert.ok(!demo.listDemoReservations().some(unit => unit.serial === libre.serial))
})

test('verificar una unidad deja usuario y fecha (sin datos reales)', () => {
  const unit = demo.listDemoUnits().find(item => item.status === 'AVAILABLE')
  const verificada = demo.verifyDemoUnit({ serial: unit.serial, locationId: 'demo-ubic-piso' })
  assert.equal(verificada.locationId, 'demo-ubic-piso')
  assert.ok(['Hernán Acosta', 'Ana Giménez', 'Diego López', 'María Benítez', 'Jorge Villalba', 'Sofía Cáceres', 'Marcos Aquino'].includes(verificada.lastVerifiedBy.name), 'la firma un usuario demo del equipo')
  assert.ok(verificada.verifiedAt)
  assert.ok(verificada.lastVerifiedAt, 'la demo espeja lastVerifiedAt (forma real)')
})

test('la venta demo marca la unidad como vendida y deja el evento (#227)', () => {
  const libre = demo.listDemoUnits().find(unit => unit.status === 'AVAILABLE')
  const [vendida] = demo.marcarUnidadesVendidasDemo({ serials: [libre.serial], orderNumber: 'MOB-0099', customerName: 'Cliente demo', totalPyg: 5000000 })
  assert.equal(vendida.status, 'SOLD')
  assert.equal(vendida.sale.orderNumber, 'MOB-0099')
  assert.ok(vendida.events.some(evento => evento.type === 'sale'), 'deja el evento de venta en la cronología')
  const enLista = demo.listDemoUnits().find(unit => unit.serial === libre.serial)
  assert.equal(enLista.status, 'SOLD')
})

// #286: el selector del POS en la demo usa los mismos filtros que la API real
// (producto + sucursal + estado) y no pierde las unidades de la sucursal demo.
test('filtrarUnidadesDemo acota por producto, sucursal y estado', () => {
  const unidades = demo.listDemoUnits()
  const producto = unidades[0]
  const delProducto = demo.filtrarUnidadesDemo(unidades, { productId: producto.productId, branchId: demo.DEMO_BRANCH })
  assert.ok(delProducto.length > 0, 'la sucursal demo tiene unidades del producto')
  assert.ok(delProducto.every(unidad => unidad.productId === producto.productId))
  const disponibles = demo.filtrarUnidadesDemo(unidades, { productId: producto.productId, branchId: demo.DEMO_BRANCH, status: 'AVAILABLE' })
  assert.ok(disponibles.every(unidad => unidad.status === 'AVAILABLE'))
  assert.deepEqual(demo.filtrarUnidadesDemo(unidades, { branchId: 'sucursal-inexistente' }), [])
  // Las unidades sin sucursal (caso borde) siguen visibles en cualquier filtro.
  assert.equal(demo.filtrarUnidadesDemo([{ id: 'x', branchId: null, status: 'AVAILABLE' }], { branchId: demo.DEMO_BRANCH }).length, 1)
})

test('recepción demo conserva ciclos de carga, incluido cero (#400)', () => {
  const productId = demo.demoInventorySeed().units[0].productId
  for (const batteryCycles of [0, 61]) {
    const serial = `CICLOS-${batteryCycles}`
    demo.createDemoUnit({ productId, serial, branchId: demo.DEMO_BRANCH, batteryHealth: 100, batteryCycles })
    assert.equal(demo.listDemoUnits(serial)[0].batteryCycles, batteryCycles)
  }
})

const camposIdentidad = ['id', 'serial', 'productId', 'status', 'condition', 'branchId', 'locationId', 'supplierName', 'costCurrency', 'originalCost', 'exchangeRatePyg', 'costPyg', 'batteryHealth', 'batteryCycles']
const identidad = unit => Object.fromEntries(camposIdentidad.map(key => [key, unit[key]]))

test('#350 conserva las identidades y valores de las 24 unidades originales', () => {
  store.clear()
  const primeras = demo.demoInventorySeed().units.slice(0, 24).map(identidad)
  // Snapshot de campos comerciales del seed anterior, HEAD5ab622ae. Se excluyen
  // solo fechas relativas al reloj, que no identifican ni valorizan la unidad.
  assert.equal(createHash('sha256').update(JSON.stringify(primeras)).digest('hex'), '6daaa79be67ae3d661e169291df4c7e6eea250a2a723823ceccc7c7651b9deb5')
})

test('#350 agrega 36 teléfonos deterministas, disponibles y sin afectar ventas/reservas', () => {
  store.clear()
  const state = demo.demoInventorySeed()
  const nuevas = state.units.slice(24, 60)
  assert.equal(nuevas.length, 36)
  assert.equal(new Set(state.units.map(unit => unit.id)).size, 62)
  store.clear()
  assert.deepEqual(state.units.map(identidad), demo.demoInventorySeed().units.map(identidad))
  const conteos = Object.fromEntries(['AVAILABLE', 'RESERVED', 'SOLD', 'DEFECTIVE', 'IN_TRANSIT'].map(status => [status, state.units.filter(unit => unit.status === status).length]))
  assert.deepEqual(conteos, { AVAILABLE: 53, RESERVED: 3, SOLD: 3, DEFECTIVE: 2, IN_TRANSIT: 1 })
  for (const unit of nuevas) {
    assert.equal(unit.status, 'AVAILABLE')
    assert.equal(unit.sale, null)
    assert.deepEqual(unit.events, [])
    assert.equal(state.locations.find(location => location.id === unit.locationId)?.branchId, unit.branchId)
    assert.ok(Date.parse(unit.createdAt) <= Date.now(), 'el ingreso nuevo no está en el futuro')
    assert.ok(unit.costPyg > 0 && unit.supplierName && unit.batteryHealth > 0)
  }
  for (const unit of state.units) {
    // Verificación independiente del dígito de control de los 60 IMEI.
    const suma = [...unit.serial].reverse().reduce((total, char, index) => {
      const doble = index % 2 ? Number(char) * 2 : Number(char)
      return total + (doble > 9 ? doble - 9 : doble)
    }, 0)
    assert.equal(suma % 10, 0, unit.serial)
  }
})
