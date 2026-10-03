import assert from 'node:assert/strict'
import test from 'node:test'
import {
  antiguedad,
  demoAutorizacionesStock,
  esAutorizacionStock,
  motivoDeSolicitudStock,
  partirAutorizacionesStock,
  sujetoDeSolicitudStock,
} from './autorizacionesStock.js'

// #331: la bandeja de Inventario solo toma los tipos del dominio de stock y
// ordena pendientes primero, con un historial corto de resueltas.
test('parte pendientes y resueltas solo de los tipos de stock (#331)', () => {
  const filas = [
    { id: 'a', kind: 'STOCK_ADJUST', status: 'PENDING', requestedValue: {} },
    { id: 'b', kind: 'TRANSFER', status: 'APPROVED', requestedValue: {} },
    { id: 'c', kind: 'CREDIT', status: 'PENDING', requestedValue: {} },
    { id: 'd', kind: 'STOCK_ADJUST', status: 'REJECTED', requestedValue: {} },
  ]
  const { pendientes, resueltas } = partirAutorizacionesStock(filas)
  assert.deepEqual(pendientes.map((fila) => fila.id), ['a'])
  assert.deepEqual(resueltas.map((fila) => fila.id), ['b', 'd'])
  assert.equal(esAutorizacionStock(filas[2]), false)
  assert.deepEqual(partirAutorizacionesStock(null), { pendientes: [], resueltas: [] })
})

test('el sujeto de un retiro/ajuste sale de la unidad cargada (#331)', () => {
  const unidad = {
    id: 'u1',
    serial: '356789012345678',
    status: 'AVAILABLE',
    branch: { name: 'Casa Central' },
    location: { name: 'Piso de venta' },
    productId: 'p1',
    product: { id: 'p1', name: 'iPhone 15', capacity: '128GB' },
  }
  const sujeto = sujetoDeSolicitudStock(
    { kind: 'STOCK_ADJUST', requestedValue: { unitId: 'u1', action: 'remove', reason: 'Daño' } },
    { unidades: [unidad], productos: [] },
  )
  assert.equal(sujeto.titulo, 'iPhone 15 · 128GB')
  assert.equal(sujeto.serial, '356789012345678')
  assert.equal(sujeto.accion, 'Dar de baja')
  assert.equal(sujeto.detalle, 'Casa Central · Piso de venta')

  // Unidad que ya no está en la lista: id corto, sin inventar modelo.
  const huerfana = sujetoDeSolicitudStock(
    { kind: 'STOCK_ADJUST', requestedValue: { unitId: 'unidad-que-no-esta', action: 'adjust' } },
    {},
  )
  assert.equal(huerfana.titulo, 'Unidad o-esta')
  assert.equal(huerfana.serial, '')
  assert.equal(huerfana.accion, 'Ajustar / revisar')
})

test('el sujeto de una transferencia arma ruta y cantidad (#331)', () => {
  const sujeto = sujetoDeSolicitudStock(
    { kind: 'TRANSFER', requestedValue: { sourceBranchId: 'b1', destinationBranchId: 'b2', productId: 'p9', quantity: 2 } },
    {
      productos: [{ id: 'p9', name: 'iPhone 14', capacity: '256GB' }],
      sucursales: [{ id: 'b1', name: 'Casa Central' }, { id: 'b2', name: 'Villa Morra' }],
    },
  )
  assert.equal(sujeto.titulo, 'iPhone 14 · 256GB')
  assert.equal(sujeto.detalle, 'Casa Central → Villa Morra · 2 unidades')

  const sinCatalogo = sujetoDeSolicitudStock({ kind: 'TRANSFER', requestedValue: { sourceBranchId: 'abcdef123456', productId: 'p9', quantity: 1 } }, {})
  assert.equal(sinCatalogo.detalle, 'Sucursal 123456 · 1 unidad')
})

test('el motivo prioriza lo pedido y cae a la nota (#331)', () => {
  assert.equal(motivoDeSolicitudStock({ requestedValue: { reason: '  Batería hinchada ' }, note: 'nota' }), 'Batería hinchada')
  assert.equal(motivoDeSolicitudStock({ requestedValue: {}, note: 'nota de la solicitud' }), 'nota de la solicitud')
  assert.equal(motivoDeSolicitudStock({}), '')
})

test('la antigüedad devuelve un valor legible (#331)', () => {
  assert.notEqual(antiguedad(new Date().toISOString()), '—')
  assert.match(antiguedad(new Date().toISOString()), /^\d{2}:\d{2}$/)
  assert.equal(antiguedad(null), '—')
  assert.equal(antiguedad('no-es-fecha'), '—')
})

test('la demo trae pendientes y resueltas del dominio de stock (#331)', () => {
  const filas = demoAutorizacionesStock()
  assert.ok(filas.length >= 3)
  assert.equal(filas.filter((fila) => fila.status === 'PENDING').length, 2)
  assert.deepEqual([...new Set(filas.map((fila) => fila.kind))].sort(), ['STOCK_ADJUST', 'TRANSFER'])
  for (const fila of filas) {
    assert.ok(fila.id.startsWith('demo-'), `${fila.id} es ficticia`)
    assert.ok(fila.requestedBy?.name, `${fila.id} tiene solicitante`)
    assert.ok(!Number.isNaN(Date.parse(fila.createdAt)), `${fila.id} tiene fecha válida`)
  }
})
