import {
  DEFAULT_OFFSET_MINUTES,
  aggregateCommissions,
  localDayKey,
  type CommissionRuleLike,
  type OrderLike,
} from './reporting'

// Cálculo de una liquidación de comisiones, aislado de la base y de HTTP para
// poder probarse con bordes (sin ventas, comisión 0, varios vendedores, período
// vacío). La ruta lo usa tal cual: lo que se congela en `linesJson` es lo que
// devuelve esta función, sin reglas duplicadas.
//
// Reglas del negocio:
// - Solo cuentan las ventas del vendedor liquidado (las de otros no entran).
// - Las canceladas no suman, igual que en el reporte de comisiones.
// - Sin ventas o sin regla vigente no hay liquidación: se informa el motivo.
// - El total sale del reporte (redondeo sobre el margen acumulado); si la suma
//   de las líneas no coincide por redondeo, la diferencia se explicita como
//   una línea "Ajuste por redondeo" para que el comprobante cuadre al centavo.

export type LiquidacionLinea = {
  orderNumber: string
  date: string
  totalPyg: number
  basePyg: number
  commissionPct: number
  commissionPyg: number
}

export type LiquidacionResultado =
  | { ok: true; totalPyg: number; marginPyg: number; commissionPct: number; orders: number; lines: LiquidacionLinea[] }
  | { ok: false; code: 'SIN_VENTAS' | 'SIN_REGLA'; message: string }

export type LiquidacionEntrada = {
  /** Ventas del período (pueden venir de varios vendedores: se filtran). */
  orders: OrderLike[]
  /** Número comercial de cada venta, por id (el ticket muestra ese código). */
  orderNumbers?: Record<string, string>
  rules: CommissionRuleLike[]
  seller: { id: string; name: string; role?: string | null }
  periodTo: string
  offsetMinutes?: number
}

export function calcularLiquidacionComisiones({
  orders,
  orderNumbers = {},
  rules,
  seller,
  periodTo,
  offsetMinutes = DEFAULT_OFFSET_MINUTES,
}: LiquidacionEntrada): LiquidacionResultado {
  const delVendedor = orders.filter(order => order.sellerId === seller.id)
  const sellers = { [seller.id]: { name: seller.name, role: seller.role ?? null } }
  const commissions = aggregateCommissions(delVendedor, rules, sellers)
  const row = commissions.sellers.find(sellerRow => sellerRow.sellerId === seller.id)
  if (!row || row.orders === 0) return { ok: false, code: 'SIN_VENTAS', message: 'El vendedor no tiene ventas en el período.' }
  if (row.commissionPct === null) return { ok: false, code: 'SIN_REGLA', message: 'El vendedor no tiene una regla de comisión vigente.' }

  // Detalle congelado por venta: se calcula con la MISMA función del reporte
  // (una orden por vez) para no duplicar la regla de margen ni el porcentaje.
  const lines: LiquidacionLinea[] = orders
    .filter(order => order.sellerId === seller.id && order.status !== 'CANCELLED')
    .map(order => {
      const single = aggregateCommissions([order], rules, sellers).sellers[0]
      return {
        orderNumber: orderNumbers[order.id] ?? '',
        date: localDayKey(order.createdAt, offsetMinutes),
        totalPyg: order.totalPyg,
        basePyg: single?.marginPyg ?? 0,
        commissionPct: single?.commissionPct ?? row.commissionPct!,
        commissionPyg: single?.commissionPyg ?? 0,
      }
    })

  const lineTotal = lines.reduce((sum, line) => sum + line.commissionPyg, 0)
  const adjustment = row.commissionPyg - lineTotal
  if (adjustment !== 0) {
    lines.push({ orderNumber: 'Ajuste por redondeo', date: periodTo, totalPyg: 0, basePyg: 0, commissionPct: row.commissionPct, commissionPyg: adjustment })
  }

  return { ok: true, totalPyg: row.commissionPyg, marginPyg: row.marginPyg, commissionPct: row.commissionPct, orders: row.orders, lines }
}
