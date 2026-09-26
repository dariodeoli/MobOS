// Pruebas del inventario demo (#213): seed con IMEIs ficticios, estados
// variados y mutaciones session-only. Sin navegador: storage falso.
import test from 'node:test'
import assert from 'node:assert/strict'

// Fuera de la demo, demoStorage delega en localStorage: acá se simula con
// memoria para que las mutaciones sobrevivan dentro del archivo de tests.
const store = new Map()
globalThis.localStorage = {
  getItem: clave => (store.has(clave) ? store.get(clave) : null),
  setItem: (clave, valor) => store.set(clave, String(valor)),
  removeItem: clave => store.delete(clave),
}

const demo = await import('./demoInventory.js')

test('el seed demo tiene 24 unidades con seriales ficticios y estados variados', () => {
  const state = demo.demoInventorySeed()
  assert.equal(state.units.length, 24)
  assert.ok(state.units.every(unit => unit.serial.startsWith('AUR')), 'los seriales llevan prefijo ficticio AUR')
  assert.ok(state.units.every(unit => !/^\d{15}$/.test(unit.serial)), 'nunca un IMEI real')
  const estados = new Set(state.units.map(unit => unit.status))
  for (const esperado of ['AVAILABLE', 'RESERVED', 'SOLD', 'DEFECTIVE', 'IN_TRANSIT']) assert.ok(estados.has(esperado), esperado)
  assert.equal(state.locations.filter(location => location.branchId === demo.DEMO_BRANCH).length, 3)
  assert.ok(state.suppliers.length >= 2)
  assert.ok(state.units.some(unit => unit.costCurrency === 'USD' && unit.originalCost > 0), 'hay costos en USD')
  assert.ok(state.units.some(unit => unit.costCurrency === 'PYG' && unit.costPyg > 0), 'y costos en Gs')
})

test('listar filtra por búsqueda y la vista de eliminados arranca vacía', () => {
  assert.equal(demo.listDemoUnits().length, 24)
  const encontradas = demo.listDemoUnits('AUR0002')
  assert.equal(encontradas.length, 1)
  assert.equal(demo.listDemoUnits('', 'removed').length, 0)
})

test('crear, mover y dar de baja una unidad demo', () => {
  const creada = demo.createDemoUnit({ productId: 'demo-iphone-15-128-azul', serial: 'AUR9999TEST', branchId: demo.DEMO_BRANCH, locationId: 'demo-ubic-piso', costPyg: 1000000 })
  assert.equal(creada.status, 'AVAILABLE')
  assert.equal(creada.product.name, 'iPhone 15 128GB Azul')
  const movida = demo.updateDemoUnit({ id: creada.id, action: 'move', locationId: 'demo-ubic-deposito-2' })
  assert.equal(movida.locationId, 'demo-ubic-deposito-2')
  demo.updateDemoUnit({ id: creada.id, action: 'remove', reason: 'QA' })
  assert.equal(demo.listDemoUnits('', 'removed').length, 1)
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
  assert.ok(['Hernán Acosta', 'Ana Giménez', 'Diego López', 'María Benítez', 'Jorge Villalba', 'Sofía Cáceres'].includes(verificada.lastVerifiedBy.name), 'la firma un usuario demo del equipo')
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
