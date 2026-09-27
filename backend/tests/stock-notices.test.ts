import assert from 'node:assert/strict'
import test from 'node:test'
import { ACCIONES_AUDITORIA_STOCK, avisosDeStock, claveDisponibilidad, eventosDeAuditoria } from '../lib/stock-notices'

// #280 · Aviso de INV al vendedor: el cambio de disponibilidad de un producto
// comprometido se traduce en una novedad para el vendedor, sin spam.

const AHORA = new Date('2026-09-27T12:00:00.000Z')
const haceHoras = (horas: number) => new Date(AHORA.getTime() - horas * 3600000)

const compromiso = (extra: Record<string, unknown> = {}) => ({
  id: 'need-1',
  orderId: 'order-1',
  orderNumber: 'PED-001',
  customerName: 'Cliente Uno',
  productId: 'prod-1',
  productName: 'iPhone 15 · 256 GB',
  branchId: 'branch-1',
  quantity: 1,
  createdAt: haceHoras(48),
  ...extra,
})

const evento = (extra: Record<string, unknown> = {}) => ({
  productId: 'prod-1',
  branchId: 'branch-1',
  tipo: 'ALTA' as const,
  at: haceHoras(2),
  userId: 'user-stock',
  ...extra,
})

const disp = (unidades: number, stock = 0) => new Map([[claveDisponibilidad('prod-1', 'branch-1'), { unidades, stock }]])

test('un alta con unidades disponibles avisa al vendedor', () => {
  const avisos = avisosDeStock([compromiso()], [evento()], disp(1), { ahora: AHORA })
  assert.equal(avisos.length, 1)
  assert.equal(avisos[0].kind, 'STOCK')
  assert.equal(avisos[0].title, 'Ya hay stock para tu pedido')
  assert.match(avisos[0].detail, /iPhone 15 · 256 GB · PED-001 · Cliente Uno · 1 disponible\(s\)/)
  assert.equal(avisos[0].href, '/pedidos/order-1')
})

test('sin stock actual, un alta no avisa nada (no se promete lo que no hay)', () => {
  assert.deepEqual(avisosDeStock([compromiso()], [evento()], disp(0), { ahora: AHORA }), [])
})

test('una baja que deja el producto sin disponibilidad avisa «quedó sin stock»', () => {
  const avisos = avisosDeStock([compromiso()], [evento({ tipo: 'BAJA' })], disp(0, 0), { ahora: AHORA })
  assert.equal(avisos.length, 1)
  assert.equal(avisos[0].kind, 'SIN_STOCK')
  assert.equal(avisos[0].title, 'Tu pedido quedó sin stock')
  assert.match(avisos[0].detail, /se dio de baja lo último disponible/)
})

test('una baja con stock todavía disponible no avisa', () => {
  assert.deepEqual(avisosDeStock([compromiso()], [evento({ tipo: 'BAJA' })], disp(2), { ahora: AHORA }), [])
})

test('el aviso es por pedido y producto y queda el último cambio (sin spam)', () => {
  const avisos = avisosDeStock(
    [compromiso(), compromiso({ id: 'need-2', quantity: 2 })],
    [evento({ at: haceHoras(20), tipo: 'BAJA' }), evento({ at: haceHoras(1) })],
    disp(3),
    { ahora: AHORA },
  )
  assert.equal(avisos.length, 1)
  assert.equal(avisos[0].id, 'stock-order-1-prod-1')
  assert.equal(avisos[0].title, 'Ya hay stock para tu pedido')
})

test('un cambio anterior al compromiso no genera aviso', () => {
  assert.deepEqual(avisosDeStock([compromiso({ createdAt: haceHoras(1) })], [evento({ at: haceHoras(5) })], disp(1), { ahora: AHORA }), [])
})

test('fuera de la ventana de 7 días no hay aviso', () => {
  assert.deepEqual(avisosDeStock([compromiso({ createdAt: haceHoras(24 * 30) })], [evento({ at: haceHoras(24 * 9) })], disp(1), { ahora: AHORA }), [])
})

test('el cambio del propio vendedor no le vuelve como aviso', () => {
  assert.deepEqual(avisosDeStock([compromiso()], [evento({ userId: 'user-1' })], disp(1), { ahora: AHORA, ignorarUsuarioId: 'user-1' }), [])
})

test('otra sucursal no cuenta como disponibilidad de la necesidad', () => {
  const otros = new Map([[claveDisponibilidad('prod-1', 'branch-2'), { unidades: 5, stock: 0 }]])
  assert.deepEqual(avisosDeStock([compromiso()], [evento({ branchId: 'branch-2' })], otros, { ahora: AHORA }), [])
})

test('se acota la cantidad de avisos', () => {
  const compromisos = Array.from({ length: 15 }, (_, indice) => compromiso({ id: `need-${indice}`, orderId: `order-${indice}` }))
  const disponibles = new Map(compromisos.map((fila) => [claveDisponibilidad(fila.productId, fila.branchId), { unidades: 1, stock: 0 }]))
  assert.equal(avisosDeStock(compromisos, [evento()], disponibles, { ahora: AHORA, maximo: 4 }).length, 4)
})

test('la auditoría de recepción (metadata con producto) se traduce a un alta', () => {
  const eventos = eventosDeAuditoria([{
    action: 'INVENTORY_UNIT_RECEIVED',
    entity: 'InventoryUnit',
    entityId: 'unit-1',
    metadata: { serial: '490154203237518', productId: 'prod-1', branchId: 'branch-1' },
    createdAt: haceHoras(3),
    userId: 'user-stock',
  }] as never)
  assert.deepEqual(eventos, [{ productId: 'prod-1', branchId: 'branch-1', tipo: 'ALTA', at: haceHoras(3), userId: 'user-stock' }])
})

test('baja, ajuste a no disponible y venta se traducen a eventos BAJA', () => {
  const eventos = eventosDeAuditoria([
    { action: 'INVENTORY_UNIT_REMOVED', entity: 'InventoryUnit', entityId: 'unit-1', metadata: { reason: 'Baja' }, createdAt: haceHoras(6), userId: 'u1' },
    { action: 'INVENTORY_UNIT_ADJUSTED', entity: 'InventoryUnit', entityId: 'unit-2', metadata: { after: { status: 'DEFECTIVE' }, before: { status: 'AVAILABLE' } }, createdAt: haceHoras(5), userId: 'u1' },
    { action: 'INVENTORY_UNIT_ADJUSTED', entity: 'InventoryUnit', entityId: 'unit-3', metadata: { after: { status: 'AVAILABLE' }, before: { status: 'DEFECTIVE' } }, createdAt: haceHoras(4), userId: 'u1' },
    { action: 'INVENTORY_UNITS_SOLD', entity: 'Order', entityId: 'order-9', metadata: { serials: ['SER-1'], productIds: ['prod-1'] }, createdAt: haceHoras(3), userId: 'u2' },
  ] as never, {
    unidadesPorId: new Map([
      ['unit-1', { productId: 'prod-1', branchId: 'branch-1' }],
      ['unit-2', { productId: 'prod-1', branchId: 'branch-1' }],
      ['unit-3', { productId: 'prod-1', branchId: 'branch-1' }],
    ]),
    unidadesPorSerial: new Map([['SER-1', { productId: 'prod-1', branchId: 'branch-1' }]]),
  })
  assert.deepEqual(eventos.map((fila) => fila.tipo), ['BAJA', 'BAJA', 'ALTA', 'BAJA'])
})

test('la edición de stock de un producto sin seriales es un evento con su dirección', () => {
  const eventos = eventosDeAuditoria([
    { action: 'PRODUCT_UPDATED', entity: 'Product', entityId: 'prod-2', metadata: { stock: 5, stockBefore: 0 }, createdAt: haceHoras(8), userId: 'u1' },
    { action: 'PRODUCT_UPDATED', entity: 'Product', entityId: 'prod-2', metadata: { stock: 2, stockBefore: 5 }, createdAt: haceHoras(7), userId: 'u1' },
    { action: 'PRODUCT_UPDATED', entity: 'Product', entityId: 'prod-2', metadata: { stock: 2, stockBefore: 2 }, createdAt: haceHoras(6), userId: 'u1' },
  ] as never, { productosPorId: new Map([['prod-2', { id: 'prod-2', branchId: 'branch-1' }]]) })
  assert.deepEqual(eventos.map((fila) => fila.tipo), ['ALTA', 'BAJA'])
})

test('la auditoría expone las acciones que mira el aviso', () => {
  for (const accion of ['INVENTORY_UNIT_RECEIVED', 'INVENTORY_UNIT_RESTORED', 'INVENTORY_UNIT_ADJUSTED', 'INVENTORY_UNIT_REMOVED', 'INVENTORY_UNITS_SOLD', 'PRODUCT_UPDATED', 'PRODUCT_CREATED']) {
    assert.ok((ACCIONES_AUDITORIA_STOCK as readonly string[]).includes(accion), `falta ${accion}`)
  }
})

console.log('stock-notices: cambios de disponibilidad → aviso al vendedor OK')
