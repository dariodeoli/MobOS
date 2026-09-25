// #250: repuestos del taller — tenencia, pago, deuda y resumen (lógica pura).
import assert from 'node:assert/strict'
import { codigoRepuesto, deudaRepuesto, esPorPagar, estadoRepuesto, PAGOS_REPUESTO, resumenRepuestos, TENENCIAS, validarRepuesto } from '../lib/workshop-parts'

// Alta: el dueño y el pago tienen que ser coherentes.
assert.deepEqual(validarRepuesto({ ownership: 'PROPIO', paymentMode: 'CONTADO', quantity: 2 }), {})
assert.deepEqual(validarRepuesto({ ownership: 'PROPIO', paymentMode: 'CREDITO', quantity: 1, dueAt: '2026-10-01' }), {})
assert.deepEqual(validarRepuesto({ ownership: 'PROVEEDOR', paymentMode: 'CONSIGNACION', supplierId: 's1', quantity: 3 }), {})
assert.match(validarRepuesto({ ownership: 'PROVEEDOR', paymentMode: 'CONSIGNACION', quantity: 1 }).error || '', /proveedor/i)
assert.match(validarRepuesto({ ownership: 'PROPIO', paymentMode: 'CONSIGNACION', supplierId: 's1', quantity: 1 }).error || '', /consignación/i)
assert.match(validarRepuesto({ ownership: 'PROPIO', paymentMode: 'CONTADO', quantity: 1, dueAt: '2026-10-01' }).error || '', /contado/i)
assert.match(validarRepuesto({ ownership: 'MIO', paymentMode: 'CONTADO', quantity: 1 }).error || '', /tenencia/i)
assert.match(validarRepuesto({ ownership: 'PROPIO', paymentMode: 'TRUEQUE', quantity: 1 }).error || '', /pago/i)
assert.match(validarRepuesto({ ownership: 'PROPIO', paymentMode: 'CONTADO', quantity: 0 }).error || '', /cantidad/i)
assert.match(validarRepuesto({ ownership: 'PROPIO', paymentMode: 'CONTADO', quantity: 1, unitCostPyg: -5 }).error || '', /costo/i)
assert.ok(TENENCIAS.includes('PROVEEDOR') && PAGOS_REPUESTO.includes('CONSIGNACION'))

// Estado: lo elige la cantidad (o la baja/devolución), nunca la UI.
assert.equal(estadoRepuesto({ quantity: 2 }), 'DISPONIBLE')
assert.equal(estadoRepuesto({ quantity: 0 }), 'AGOTADO')
assert.equal(estadoRepuesto({ status: 'DEVUELTO', quantity: 0 }), 'DEVUELTO')
assert.equal(estadoRepuesto({ status: 'BAJA', quantity: 0 }), 'BAJA')

// Deuda: crédito desde el alta; consignación recién por lo usado; contado no debe.
const credito = { paymentMode: 'CREDITO', quantity: 4, usedQuantity: 0, unitCostPyg: 50000, totalCostPyg: 200000 }
assert.equal(esPorPagar(credito), true)
assert.equal(deudaRepuesto(credito), 200000)
assert.equal(deudaRepuesto({ ...credito, totalCostPyg: null }), 200000, 'sin total, la deuda es unitario × cantidad')
assert.equal(deudaRepuesto({ ...credito, paidAt: '2026-09-25T10:00:00.000Z' }), 0, 'pago cierra la deuda')
const consignacion = { ownership: 'PROVEEDOR', paymentMode: 'CONSIGNACION', quantity: 5, usedQuantity: 2, unitCostPyg: 30000, totalCostPyg: 150000 }
assert.equal(esPorPagar(consignacion), true)
assert.equal(deudaRepuesto(consignacion), 60000, 'la consignación se paga por lo usado')
assert.equal(deudaRepuesto({ ...consignacion, usedQuantity: 0 }), 0, 'sin usar, no hay deuda')
assert.equal(deudaRepuesto({ paymentMode: 'CONTADO', quantity: 2, unitCostPyg: 10000, totalCostPyg: 20000 }), 0)

// Resumen para el panel y FIN.
const resumen = resumenRepuestos([
  credito,
  consignacion,
  { paymentMode: 'CONTADO', ownership: 'PROPIO', quantity: 3, status: 'DISPONIBLE', unitCostPyg: 1000, totalCostPyg: 3000 },
  { paymentMode: 'CREDITO', ownership: 'PROPIO', quantity: 1, unitCostPyg: 10000, totalCostPyg: 10000, dueAt: '2026-09-01T00:00:00.000Z', paidAt: '2026-09-10T00:00:00.000Z', status: 'DISPONIBLE' },
], { ahora: '2026-09-25T12:00:00.000Z' })
assert.deepEqual(resumen, { total: 4, disponibles: 4, propios: 3, deProveedor: 1, porPagar: 2, porPagarPyg: 260000, vencidas: 0, vencidasPyg: 0, unidadesDisponibles: 13 })

const conVencida = resumenRepuestos([{ ...credito, dueAt: '2026-09-01T00:00:00.000Z' }], { ahora: '2026-09-25T12:00:00.000Z' })
assert.deepEqual([conVencida.vencidas, conVencida.vencidasPyg], [1, 200000])

assert.equal(codigoRepuesto(1), 'REP-#0001')
assert.equal(codigoRepuesto(27), 'REP-#0027')
assert.equal(codigoRepuesto(0), 'REP-#0001')
assert.equal(codigoRepuesto(99999), 'REP-#99999')
