import assert from 'node:assert/strict'
import { consolidarNecesidades, normalizarNecesidadManual, prioridadMayor } from '../lib/supply'

// ── Prioridad (para consolidar) ─────────────────────────────────────────────
assert.equal(prioridadMayor('BAJA', 'URGENTE'), 'URGENTE')
assert.equal(prioridadMayor('ALTA', 'NORMAL'), 'ALTA')
assert.equal(prioridadMayor('NORMAL', 'NORMAL'), 'NORMAL')

// ── Consolidación (#250 §5): agrupa iguales, conserva destinos ──────────────
const grupos = consolidarNecesidades([
  { id: 'n1', productId: 'p1', producto: 'iPhone 15', condicion: 'NEW', cantidad: 1, prioridad: 'NORMAL', origen: 'SALE_NO_STOCK', pedidoId: 'o1', pedidoNumero: 'MOB-0048', clienteId: 'c1', cliente: 'Juan Pérez', prometidaEl: '2026-10-02T10:00:00.000Z', sucursalId: 'b1', sucursal: 'Casa Central' },
  { id: 'n2', productId: 'p1', producto: 'iPhone 15', condicion: 'NEW', cantidad: 2, prioridad: 'ALTA', origen: 'RESERVATION_NO_STOCK', pedidoId: 'o2', pedidoNumero: 'MOB-0051', clienteId: 'c2', cliente: 'Lucía F.', prometidaEl: '2026-10-01T10:00:00.000Z', sucursalId: 'b1', sucursal: 'Casa Central' },
  { id: 'n3', productId: 'p1', producto: 'iPhone 15', condicion: 'NEW', cantidad: 3, prioridad: 'NORMAL', origen: 'BELOW_REORDER', sucursalId: 'b1', sucursal: 'Casa Central' },
  { id: 'n4', productId: 'p1', producto: 'iPhone 15', condicion: 'USED', cantidad: 1, prioridad: 'BAJA', origen: 'MANUAL', sucursalId: 'b2', sucursal: 'Villa Morra' },
])
assert.equal(grupos.length, 2, 'no se mezclan condiciones distintas')
const nuevo = grupos.find((grupo) => grupo.condicion === 'NEW')!
assert.equal(nuevo.cantidad, 6, 'suma las cantidades')
assert.equal(nuevo.prioridad, 'ALTA', 'queda la prioridad más alta')
assert.equal(nuevo.prometidaEl, '2026-10-01T10:00:00.000Z', 'queda la fecha prometida más próxima')
assert.deepEqual(nuevo.origenes.sort(), ['BELOW_REORDER', 'RESERVATION_NO_STOCK', 'SALE_NO_STOCK'])
assert.equal(nuevo.destinos.length, 3, 'conserva los destinos (1 pedido A · 2 pedido B · 3 stock)')
const pedidoA = nuevo.destinos.find((destino) => destino.pedidoId === 'o1')!
assert.equal(pedidoA.cantidad, 1)
assert.equal(pedidoA.etiqueta, 'Pedido MOB-0048 · Juan Pérez')
assert.equal(pedidoA.tipo, 'PEDIDO')
const pedidoB = nuevo.destinos.find((destino) => destino.pedidoId === 'o2')!
assert.equal(pedidoB.cantidad, 2)
const reposicion = nuevo.destinos.find((destino) => destino.tipo === 'STOCK')!
assert.equal(reposicion.cantidad, 3)
assert.equal(reposicion.etiqueta, 'Reposición · Casa Central')
assert.deepEqual(nuevo.necesidades.sort(), ['n1', 'n2', 'n3'])

// Los destinos del mismo pedido se fusionan sumando cantidades.
const fusionados = consolidarNecesidades([
  { id: 'm1', productId: 'p2', cantidad: 1, prioridad: 'NORMAL', origen: 'MANUAL', pedidoId: 'o9', pedidoNumero: 'MOB-0099', sucursalId: 'b1' },
  { id: 'm2', productId: 'p2', cantidad: 2, prioridad: 'ALTA', origen: 'SALE_NO_STOCK', pedidoId: 'o9', pedidoNumero: 'MOB-0099', sucursalId: 'b1', prometidaEl: '2026-09-30T09:00:00.000Z' },
])
assert.equal(fusionados.length, 1)
assert.equal(fusionados[0].destinos.length, 1)
assert.equal(fusionados[0].destinos[0].cantidad, 3)
assert.equal(fusionados[0].destinos[0].prometidaEl, '2026-09-30T09:00:00.000Z')

// Orden del panel: primero la prioridad más alta; sin datos no rompe.
assert.equal(consolidarNecesidades([]).length, 0)
assert.equal(consolidarNecesidades([{ id: 'x', productId: '', cantidad: 1, prioridad: 'NORMAL', origen: 'MANUAL' }]).length, 0)
const orden = consolidarNecesidades([
  { id: 'o1', productId: 'p1', cantidad: 1, prioridad: 'BAJA', origen: 'MANUAL' },
  { id: 'o2', productId: 'p2', cantidad: 1, prioridad: 'URGENTE', origen: 'MANUAL' },
  { id: 'o3', productId: 'p3', cantidad: 1, prioridad: 'NORMAL', origen: 'MANUAL', prometidaEl: '2026-09-25T00:00:00.000Z' },
  { id: 'o4', productId: 'p4', cantidad: 1, prioridad: 'NORMAL', origen: 'MANUAL', prometidaEl: '2026-12-01T00:00:00.000Z' },
])
assert.deepEqual(orden.map((grupo) => grupo.productoId), ['p2', 'p3', 'p4', 'p1'])

// ── Carga manual: validaciones ──────────────────────────────────────────────
assert.equal(normalizarNecesidadManual({}).ok, false)
assert.equal(normalizarNecesidadManual({ productId: 'p1', quantity: 0 }).ok, false)
assert.equal(normalizarNecesidadManual({ productId: 'p1', quantity: 2.5 }).ok, false)
assert.equal(normalizarNecesidadManual({ productId: 'p1', quantity: 1, priority: 'YA' }).ok, false)
assert.equal(normalizarNecesidadManual({ productId: 'p1', quantity: 1, condition: 'ROTO' }).ok, false)
assert.equal(normalizarNecesidadManual({ productId: 'p1', quantity: 1, promisedAt: 'nada' }).ok, false)
const manual = normalizarNecesidadManual({ productId: ' p1 ', quantity: 2, condition: 'used', priority: 'urgente', promisedAt: '2026-10-05T12:00:00.000Z', notes: '  Reposición preventiva  ' })
assert.equal(manual.ok, true)
assert.deepEqual(manual.ok && manual.data, { productId: 'p1', branchId: null, quantity: 2, condition: 'USED', priority: 'URGENTE', promisedAt: '2026-10-05T12:00:00.000Z', notes: 'Reposición preventiva' })
