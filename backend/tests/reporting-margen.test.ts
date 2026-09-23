import assert from 'node:assert/strict'
import { aggregateCommissions, aggregateReport } from '../lib/reporting'
import { realMargin } from '../lib/finance'

// El descuento del carrito es a nivel orden (`Order.discountPyg`): la ganancia
// por vendedor/día tiene que reconocer la venta neta (Total − Costo) y la
// comisión se liquida sobre ese margen real. Antes el reporte sumaba los
// totales de línea sin descontar, mostraba más ganancia que `Total − Costo` y
// pagaba comisiones infladas.

const ventaConDescuento = {
  id: 'venta-descuento',
  status: 'COMPLETED',
  subtotalPyg: 100000,
  discountPyg: 10000,
  deliveryPyg: 0,
  totalPyg: 90000,
  sellerId: 'v1',
  sellerName: 'Vendedor Uno',
  createdAt: '2026-09-10T15:00:00.000Z',
  items: [{ productId: 'p1', description: 'Case iPhone 15', quantity: 1, unitCostPyg: 60000, totalPyg: 100000 }],
  payments: [{ status: 'CONFIRMED', amountPyg: 90000 }],
}

// ── Ganancia del período y por agrupación de orden ─────────────────────────
const porVendedor = aggregateReport([ventaConDescuento], { groupBy: 'seller', offsetMinutes: -180 })
assert.equal(porVendedor.totals.totalPyg, 90000)
assert.equal(porVendedor.totals.costPyg, 60000)
assert.equal(porVendedor.totals.profitPyg, 30000, 'la ganancia es Total − Costo (90.000 − 60.000)')
assert.equal(porVendedor.totals.salesWithCostPyg, 90000)
assert.equal(porVendedor.totals.marginPct, 33.3)
assert.equal(porVendedor.groups[0].profitPyg, 30000)
assert.equal(porVendedor.groups[0].netProfitPyg, 30000)

// Por producto el descuento del carrito sigue perteneciendo a la orden: la
// fila muestra el margen de la línea y el total del período ya es neto.
const porProducto = aggregateReport([ventaConDescuento], { groupBy: 'product', offsetMinutes: -180 })
assert.equal(porProducto.groups[0].profitPyg, 40000)
assert.equal(porProducto.totals.profitPyg, 30000)

// ── Comisión del vendedor sobre el margen real ─────────────────────────────
const comisiones = aggregateCommissions([ventaConDescuento], [{ userId: 'v1', percentPyg: 10 }])
assert.equal(comisiones.sellers[0].marginPyg, 30000)
assert.equal(comisiones.sellers[0].commissionPyg, 3000)
assert.equal(comisiones.totals.commissionPyg, 3000)

// ── El descuento no inventa pérdidas ni ganancias ──────────────────────────
const ventaAlLimite = {
  ...ventaConDescuento,
  id: 'venta-al-limite',
  subtotalPyg: 100000,
  discountPyg: 95000,
  totalPyg: 5000,
}
const alLimite = aggregateReport([ventaAlLimite], { groupBy: 'seller', offsetMinutes: -180 })
assert.equal(alLimite.totals.profitPyg, 0)
assert.equal(alLimite.totals.marginPct, 0)
const comisionAlLimite = aggregateCommissions([ventaAlLimite], [{ userId: 'v1', percentPyg: 10 }])
assert.equal(comisionAlLimite.sellers[0].marginPyg, 0)
assert.equal(comisionAlLimite.sellers[0].commissionPyg, 0)

// ── Margen real de Caja (misma regla) ──────────────────────────────────────
assert.deepEqual(
  realMargin([{ quantity: 1, totalPyg: 100000, unitCostPyg: 60000 }], { discountPyg: 10000 }),
  { revenuePyg: 90000, costPyg: 60000, profitPyg: 30000, marginPct: 33.33, unknownCostLines: 0 },
)

// ── Una sola fórmula de margen por venta ───────────────────────────────────
// Una línea vendida bajo costo (liquidación) no puede pagar comisión sobre un
// margen que la venta no dejó: el reporte y las comisiones comparten la misma
// cuenta por venta, con la pérdida descontada una sola vez.
const ventaConPerdida = {
  id: 'venta-perdida',
  status: 'COMPLETED',
  subtotalPyg: 600,
  discountPyg: 0,
  deliveryPyg: 0,
  totalPyg: 600,
  sellerId: 'v1',
  sellerName: 'Vendedor Uno',
  createdAt: '2026-09-10T15:00:00.000Z',
  items: [
    { productId: 'p1', description: 'Liquidación bajo costo', quantity: 1, unitCostPyg: 200, totalPyg: 100 },
    { productId: 'p2', description: 'Línea rentable', quantity: 1, unitCostPyg: 100, totalPyg: 500 },
  ],
  payments: [{ status: 'CONFIRMED', amountPyg: 600 }],
}
const reporteConPerdida = aggregateReport([ventaConPerdida], { groupBy: 'seller', offsetMinutes: -180 })
assert.equal(reporteConPerdida.totals.profitPyg, 300, 'el margen de la venta es 600 − 300')
const comisionesConPerdida = aggregateCommissions([ventaConPerdida], [{ userId: 'v1', percentPyg: 10 }])
assert.equal(comisionesConPerdida.sellers[0].marginPyg, 300, 'la comisión usa el mismo margen que el reporte')
assert.equal(comisionesConPerdida.sellers[0].commissionPyg, 30)

console.log('reporting-margen.test.ts: descuento del carrito y margen único por venta: ok')
