// #250 Fase 6: reposición sugerida, rendimiento por proveedor, tiempos de
// tránsito (CDE→ASU) y alertas de atraso — lógica pura.
import assert from 'node:assert/strict'
import { enviosAtrasados, necesidadesAtrasadas, rendimientoProveedor, reposicionSugerida, tiemposDeTransito } from '../lib/supply-forecast'

// ── Reposición sugerida ─────────────────────────────────────────────────────
const sinStock = reposicionSugerida({ stock: 0, safetyStock: 2, leadTimeDays: 4, consumoDiario: 1 })
assert.deepEqual([sinStock.puntoPedido, sinStock.sugerida, sinStock.urgencia], [6, 6, 'ALTA'])
assert.match(sinStock.motivo, /punto de pedido 6/)

// Lo que viene en camino y lo ya pedido descuentan la sugerencia.
const enCamino = reposicionSugerida({ stock: 3, safetyStock: 2, leadTimeDays: 4, consumoDiario: 0.5, enCamino: 2, abiertas: 1 })
assert.deepEqual([enCamino.puntoPedido, enCamino.disponible, enCamino.sugerida, enCamino.urgencia], [4, 6, 0, 'MEDIA'])
assert.match(enCamino.motivo, /cubierto/)

const cubierto = reposicionSugerida({ stock: 10, safetyStock: 1, leadTimeDays: 1, consumoDiario: 0.2 })
assert.deepEqual([cubierto.sugerida, cubierto.urgencia], [0, 'BAJA'])

// Con el stock justo en el colchón la urgencia es alta aunque el margen sea 1.
const colchon = reposicionSugerida({ stock: 1, safetyStock: 1, leadTimeDays: 3, consumoDiario: 0.3 })
assert.deepEqual([colchon.puntoPedido, colchon.sugerida, colchon.urgencia], [2, 1, 'ALTA'])

// ── Rendimiento por proveedor ───────────────────────────────────────────────
const rendimiento = rendimientoProveedor([
  { supplierId: 's1', supplierName: 'Proveedor A', unidades: 10, costPyg: 1000000, creadaEl: '2026-09-01T00:00:00Z', recibidaEl: '2026-09-11T00:00:00Z', etaEl: '2026-09-12T00:00:00Z', faltantes: 1, incidencias: 2 },
  { supplierId: 's1', supplierName: 'Proveedor A', unidades: 5, costPyg: 500000, creadaEl: '2026-09-05T00:00:00Z', recibidaEl: '2026-09-15T00:00:00Z', etaEl: '2026-09-10T00:00:00Z' },
  { supplierId: null, supplierName: 'Suelto', unidades: 2, costPyg: 100000, creadaEl: '2026-09-05T00:00:00Z' },
])
const proveedorA = rendimiento.find((fila) => fila.supplierId === 's1')!
assert.deepEqual([proveedorA.compras, proveedorA.unidades, proveedorA.costPyg], [2, 15, 1500000])
assert.equal(proveedorA.plazoPromedioDias, 10, 'compra → recepción promedio')
assert.equal(proveedorA.costoPromedioUnidadPyg, 100000, 'costo real promedio por unidad (FIN)')
assert.equal(proveedorA.puntualidadPct, 50, 'una de dos llegó dentro de la ETA')
assert.equal(proveedorA.faltantesPct, 6.7)
assert.equal(proveedorA.incidencias, 2)
const suelto = rendimiento.find((fila) => fila.supplierId === null)!
assert.deepEqual([suelto.plazoPromedioDias, suelto.puntualidadPct], [null, null], 'sin recepción ni ETA no inventa métricas')
assert.equal(suelto.costoPromedioUnidadPyg, 50000)

// ── Tiempos de tránsito (CDE→ASU) ───────────────────────────────────────────
const rutas = tiemposDeTransito([
  { origen: 'CDE', destino: 'Asunción', metodo: 'BUS', salidaEl: '2026-09-01T00:00:00Z', llegadaEl: '2026-09-02T00:00:00Z', etaEl: '2026-09-01T12:00:00Z', unidades: 2 },
  { origen: 'CDE', destino: 'Asunción', metodo: 'BUS', salidaEl: '2026-09-01T00:00:00Z', llegadaEl: '2026-09-04T00:00:00Z', etaEl: '2026-09-04T00:00:00Z' },
  { origen: 'CDE', destino: 'Asunción', metodo: 'AEX', salidaEl: '2026-09-01T00:00:00Z' },
])
const bus = rutas.find((fila) => fila.metodo === 'BUS')!
assert.equal(bus.ruta, 'CDE → Asunción')
assert.deepEqual([bus.lotes, bus.unidades, bus.diasPromedio, bus.diasMaximos], [2, 2, 2, 3])
assert.equal(bus.enTiempoPct, 50, 'uno de los dos llegó dentro de la ETA')
assert.equal(bus.atrasoPromedioDias, 0.5, 'el atraso real se promedia (solo lo atrasado)')
assert.equal(rutas.find((fila) => fila.metodo === 'AEX')!.diasPromedio, null, 'lo que no llegó no promedia')

// ── Alertas de atraso ───────────────────────────────────────────────────────
const atrasados = enviosAtrasados({
  ahora: '2026-09-10T00:00:00Z',
  envios: [
    { code: 'ENV-1', origen: 'CDE', destino: 'Asunción', metodo: 'BUS', estado: 'EN_TRANSITO', etaEl: '2026-09-08T00:00:00Z' },
    { code: 'ENV-2', etaEl: '2026-09-12T00:00:00Z' },
    { code: 'ENV-3' },
  ],
})
assert.equal(atrasados.length, 1)
assert.deepEqual([atrasados[0].code, atrasados[0].diasAtraso], ['ENV-1', 2])

const vencidas = necesidadesAtrasadas({
  ahora: '2026-09-10T00:00:00Z',
  necesidades: [
    { id: 'n1', productId: 'p1', producto: 'iPhone 13', branchId: 'b1', sucursal: 'Asunción', quantity: 2, prioridad: 'URGENTE', prometidaEn: '2026-09-07T00:00:00Z', orderId: 'o1', source: 'SALE_NO_STOCK' },
    { id: 'n2', prometidaEn: '2026-09-20T00:00:00Z' },
    { id: 'n3' },
  ],
})
assert.equal(vencidas.length, 1)
assert.deepEqual([vencidas[0].id, vencidas[0].diasVencidos, vencidas[0].quantity, vencidas[0].prioridad], ['n1', 3, 2, 'URGENTE'])
