import assert from 'node:assert/strict'
import test from 'node:test'
import { MARGEN_ALTO_PYG, costoEstimadoDeNecesidad, margenEstimadoDeNecesidad, prioridadDeNecesidad } from '../lib/supply-priority'
import { consolidarNecesidades } from '../lib/supply'

// #254 · FIN: prioridad de una necesidad por venta/margen/fecha y costos
// estimados (reglas puras, sin base).

const HOY = '2026-09-26T12:00:00.000Z'

test('la prioridad base sale del origen de la demanda', () => {
  assert.equal(prioridadDeNecesidad({ origen: 'SALE_NO_STOCK', hoy: HOY }), 'ALTA')
  assert.equal(prioridadDeNecesidad({ origen: 'ORDER_COMMITTED', hoy: HOY }), 'ALTA')
  assert.equal(prioridadDeNecesidad({ origen: 'RESERVATION_NO_STOCK', hoy: HOY }), 'NORMAL')
  assert.equal(prioridadDeNecesidad({ origen: 'QUANTITY_OVER_STOCK', hoy: HOY }), 'NORMAL')
  assert.equal(prioridadDeNecesidad({ origen: 'MANUAL', hoy: HOY }), 'NORMAL')
  assert.equal(prioridadDeNecesidad({ origen: 'BELOW_REORDER', hoy: HOY }), 'BAJA')
  assert.equal(prioridadDeNecesidad({ origen: 'OTRO', hoy: HOY }), 'NORMAL')
})

test('la venta confirmada y el margen mueven un escalón', () => {
  assert.equal(prioridadDeNecesidad({ origen: 'RESERVATION_NO_STOCK', ventaConfirmada: true, hoy: HOY }), 'ALTA')
  assert.equal(prioridadDeNecesidad({ origen: 'RESERVATION_NO_STOCK', margenPyg: MARGEN_ALTO_PYG, hoy: HOY }), 'ALTA')
  assert.equal(prioridadDeNecesidad({ origen: 'SALE_NO_STOCK', margenPyg: -1, hoy: HOY }), 'NORMAL')
  // Venta confirmada + margen alto no pasa de URGENTE.
  assert.equal(prioridadDeNecesidad({ origen: 'SALE_NO_STOCK', ventaConfirmada: true, margenPyg: 5_000_000, hoy: HOY }), 'URGENTE')
})

test('la fecha prometida escala y una vencida es urgente', () => {
  assert.equal(prioridadDeNecesidad({ origen: 'BELOW_REORDER', prometidaEl: '2026-09-20T10:00:00.000Z', hoy: HOY }), 'URGENTE')
  assert.equal(prioridadDeNecesidad({ origen: 'RESERVATION_NO_STOCK', prometidaEl: '2026-09-27T10:00:00.000Z', hoy: HOY }), 'URGENTE')
  assert.equal(prioridadDeNecesidad({ origen: 'RESERVATION_NO_STOCK', prometidaEl: '2026-10-01T10:00:00.000Z', hoy: HOY }), 'ALTA')
  assert.equal(prioridadDeNecesidad({ origen: 'RESERVATION_NO_STOCK', prometidaEl: '2026-11-01T10:00:00.000Z', hoy: HOY }), 'NORMAL')
  assert.equal(prioridadDeNecesidad({ origen: 'BELOW_REORDER', prometidaEl: 'no-es-fecha', hoy: HOY }), 'BAJA')
  // Una fecha vencida con margen negativo sigue siendo urgente (compromiso).
  assert.equal(prioridadDeNecesidad({ origen: 'SALE_NO_STOCK', margenPyg: -1, prometidaEl: '2026-09-25T10:00:00.000Z', hoy: HOY }), 'URGENTE')
})

test('costo y margen estimados de la necesidad', () => {
  assert.equal(costoEstimadoDeNecesidad({ costoUnitarioPyg: 1500000, cantidad: 2 }), 3000000)
  assert.equal(costoEstimadoDeNecesidad({ costoUnitarioPyg: null, cantidad: 2 }), null)
  assert.equal(costoEstimadoDeNecesidad({ costoUnitarioPyg: 999, cantidad: 0 }), 999)
  assert.equal(margenEstimadoDeNecesidad({ precioUnitarioPyg: 2000000, costoUnitarioPyg: 1500000, cantidad: 2 }), 1000000)
  assert.equal(margenEstimadoDeNecesidad({ precioUnitarioPyg: null, costoUnitarioPyg: 1500000, cantidad: 2 }), null)
  assert.equal(margenEstimadoDeNecesidad({ precioUnitarioPyg: 1000000, costoUnitarioPyg: 1200000, cantidad: 1 }), -200000)
})

test('la consolidación suma costo y margen del grupo', () => {
  const grupos = consolidarNecesidades([
    { id: 'n1', productId: 'p1', producto: 'iPhone', cantidad: 1, prioridad: 'NORMAL', origen: 'MANUAL', costoEstimadoPyg: 1500000, margenEstimadoPyg: 500000 },
    { id: 'n2', productId: 'p1', producto: 'iPhone', cantidad: 2, prioridad: 'ALTA', origen: 'MANUAL', costoEstimadoPyg: 3000000, margenEstimadoPyg: 1000000 },
    { id: 'n3', productId: 'p2', producto: 'Cable', cantidad: 1, prioridad: 'BAJA', origen: 'BELOW_REORDER' },
  ])
  const iPhone = grupos.find((grupo) => grupo.productoId === 'p1')!
  assert.equal(iPhone.cantidad, 3)
  assert.equal(iPhone.prioridad, 'ALTA')
  assert.equal(iPhone.costoEstimadoPyg, 4500000)
  assert.equal(iPhone.margenEstimadoPyg, 1500000)
  const cable = grupos.find((grupo) => grupo.productoId === 'p2')!
  assert.equal(cable.costoEstimadoPyg, null)
  assert.equal(cable.margenEstimadoPyg, null)
})
