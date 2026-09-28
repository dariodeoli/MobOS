import assert from 'node:assert/strict'
import test from 'node:test'
import { reservaDeAsignacion, TRANSIT_ESTADOS, vincularAsignacionAlRecibir } from '../lib/transit'

// #279 (A4) · Vender en tránsito: la asignación futura bloquea la unidad y al
// recibirla vincula el IMEI a la venta que la esperaba.

test('los estados de la asignación futura son los tres del ciclo', () => {
  assert.deepEqual([...TRANSIT_ESTADOS], ['ASIGNADA', 'VINCULADA', 'LIBERADA'])
})

test('una asignación deja la unidad reservada a nombre de quien la apartó', () => {
  assert.deepEqual(reservaDeAsignacion(null), { status: 'AVAILABLE', reservationCustomer: null, reservationCustomerId: null, reservedById: null })
  assert.deepEqual(
    reservaDeAsignacion({ customerId: 'cli-1', customerName: 'Ana', sellerId: 'user-1' }),
    { status: 'RESERVED', reservationCustomer: 'Ana', reservationCustomerId: 'cli-1', reservedById: 'user-1' },
  )
  // Apartada sin ficha: queda reservada igual (no se le ofrece a otro vendedor).
  assert.deepEqual(
    reservaDeAsignacion({ customerId: null, customerName: null, sellerId: 'user-2' }),
    { status: 'RESERVED', reservationCustomer: null, reservationCustomerId: null, reservedById: 'user-2' },
  )
})

// Cliente de transacción mínimo: registra lo que la vinculación toca.
function txFalso({ asignacion = null } = {}) {
  const llamadas: { updates: unknown[]; serials: string[]; linea?: string[]; serialsPendientes?: number; audits: Array<Record<string, unknown>> } = { updates: [], serials: [], audits: [] }
  return {
    llamadas,
    transitAssignment: {
      findFirst: async () => asignacion,
      update: async ({ where, data }) => { llamadas.updates.push({ where, data }); return { id: where.id, ...data } },
    },
    orderItem: {
      findFirst: async () => ({ id: 'item-1', serials: [], serialsPending: 1 }),
      update: async ({ data }) => { llamadas.linea = Array.isArray(data.serials) ? data.serials : []; llamadas.serialsPendientes = data.serialsPending; return { id: 'item-1', ...data } },
    },
    orderItemSerial: { deleteMany: async () => {}, createMany: async ({ data }) => { llamadas.serials.push(...data.map((fila: { serial: string }) => fila.serial)) } },
    auditLog: { create: async ({ data }) => { llamadas.audits.push(data) } },
  }
}

test('al recibir una unidad apartada, el IMEI se vincula al pedido y la asignación pasa a VINCULADA', async () => {
  const tx = txFalso({ asignacion: { id: 'asig-1', orderId: 'order-1', orderItemId: 'item-1', customerName: 'Ana', sellerId: 'user-1' } })
  const vinculada = await vincularAsignacionAlRecibir(tx as never, { tenantId: 't1', unit: { id: 'u1', serial: 'ABC123' }, userId: 'user-9' })
  assert.equal(vinculada.status, 'VINCULADA')
  assert.deepEqual(tx.llamadas.linea, ['ABC123'], 'la línea del pedido recibe su IMEI')
assert.deepEqual(tx.llamadas.serials, ['ABC123'], 'el índice de seriales se sincroniza')
assert.equal(tx.llamadas.serialsPendientes, 0, 'la línea deja de esperar el IMEI')
  assert.equal(tx.llamadas.updates[0].where.id, 'asig-1')
  assert.equal(tx.llamadas.audits[0].action, 'TRANSIT_UNIT_LINKED')
  assert.equal(tx.llamadas.audits[0].metadata.serial, 'ABC123')
  assert.equal(tx.llamadas.audits[0].metadata.orderId, 'order-1')
})

test('sin asignación viva no se toca nada (la recepción sigue igual)', async () => {
  const tx = txFalso({ asignacion: null })
  const resultado = await vincularAsignacionAlRecibir(tx as never, { tenantId: 't1', unit: { id: 'u1', serial: 'ABC123' }, userId: 'user-9' })
  assert.equal(resultado, null)
  assert.deepEqual(tx.llamadas, { updates: [], serials: [], audits: [] })
})

test('una asignación sin pedido se vincula igual (reserva a futuro)', async () => {
  const tx = txFalso({ asignacion: { id: 'asig-2', orderId: null, orderItemId: null, customerName: null, sellerId: 'user-2' } })
  const vinculada = await vincularAsignacionAlRecibir(tx as never, { tenantId: 't1', unit: { id: 'u1', serial: 'XYZ' }, userId: null })
  assert.equal(vinculada.status, 'VINCULADA')
  assert.deepEqual(tx.llamadas.serials, [], 'sin pedido no hay serial que vincular')
  assert.equal(tx.llamadas.audits[0].metadata.orderId, null)
})

console.log('transit: asignaciones futuras y vínculo del IMEI OK')
