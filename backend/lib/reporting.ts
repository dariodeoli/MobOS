// Lógica pura de reportes de MobOS: no toca la base de datos para poder
// probarse aislada (ver tests/reporting.test.ts) y reutilizarse desde la ruta.
//
// Reglas que se respetan a propósito:
// - Los importes son enteros de guaraníes; se acumulan con control de rango.
// - Una venta cuenta una sola vez, aunque tenga varios pagos o líneas.
// - La ganancia solo se calcula con costos conocidos; las líneas sin costo se
//   informan aparte y nunca se asume costo 0.
// - Las órdenes canceladas no suman. Los pagos no confirmados no suman cobros.
// - Producto y categoría agrupan a nivel de línea (una orden con dos productos
//   suma a los dos, sin repartir el descuento global); día y vendedor agrupan a
//   nivel de orden, con cobros y saldo reales.

export const REPORT_GROUP_BY = ['product', 'category', 'seller', 'day', 'payments', 'newCustomers', 'branch', 'customers', 'returns'] as const
export type ReportGroupBy = (typeof REPORT_GROUP_BY)[number]

/** Corte de la agrupación `payments` (#171): cuenta, procesadora o medio. */
export const PAYMENTS_BY = ['account', 'processor', 'method'] as const
export type PaymentsBy = (typeof PAYMENTS_BY)[number]

/** Roles con acceso a reportes financieros (costos y ganancia incluidos). */
export const REPORT_ROLES = ['ADMIN', 'GERENTE'] as const

/** Agrupaciones calculadas por línea en vez de por orden. */
export const LINE_LEVEL_GROUPS: readonly ReportGroupBy[] = ['product', 'category']

/** Tope de órdenes por consulta. Por encima, la ruta informa `truncated`. */
export const MAX_REPORT_ORDERS = 5000

/** Paraguay quedó en UTC-3 fijo desde octubre de 2024. */
export const DEFAULT_OFFSET_MINUTES = -180

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const MAX_RANGE_DAYS = 366
const MIN_OFFSET_MINUTES = -720
const MAX_OFFSET_MINUTES = 840
const INT_MAX = 2147483647
const DAY_MS = 86400000

export type OrderItemLike = {
  productId?: string | null
  description?: string | null
  productName?: string | null
  category?: string | null
  quantity: number
  unitCostPyg?: number | null
  totalPyg: number
}

export type PaymentLike = { status?: string | null; amountPyg: number; method?: string | null; accountName?: string | null; accountId?: string | null; processor?: string | null }

export type OrderLike = {
  id: string
  status?: string | null
  subtotalPyg: number
  discountPyg?: number | null
  deliveryPyg?: number | null
  totalPyg: number
  sellerId?: string | null
  sellerName?: string | null
  customerId?: string | null
  customerName?: string | null
  branchId?: string | null
  branchName?: string | null
  createdAt: Date | string
  items?: OrderItemLike[]
  payments?: PaymentLike[]
}

export type ReportTotals = {
  orders: number
  units: number
  grossPyg: number
  discountPyg: number
  deliveryPyg: number
  totalPyg: number
  collectedPyg: number
  pendingPyg: number
  costPyg: number
  profitPyg: number
  salesWithCostPyg: number
  salesWithoutCostPyg: number
  linesWithoutCost: number
  marginPct: number | null
  commissionPyg: number
  netProfitPyg: number
  netMarginPct: number | null
  refundedPyg: number
  // Conteos de órdenes para la portada ejecutiva (#171): cobradas y con saldo.
  // En `groupBy=payments` (que cuenta pagos, no órdenes) quedan en 0.
  paidOrders: number
  pendingOrders: number
}

export type ReportGroup = {
  key: string
  label: string
  orders: number
  units: number
  grossPyg: number
  discountPyg: number
  deliveryPyg: number
  totalPyg: number
  collectedPyg: number
  pendingPyg: number
  costPyg: number
  profitPyg: number
  salesWithoutCostPyg: number
  linesWithoutCost: number
  commissionPyg: number
  netProfitPyg: number
  refundedPyg: number
  customers: number
  newCustomers: number
  returningCustomers: number
}

export type ReportResult = { totals: ReportTotals; groups: ReportGroup[] }

export type ReportQuery = {
  from: string
  to: string
  groupBy: ReportGroupBy
  offsetMinutes: number
  paymentsBy: PaymentsBy
}

// ---- Comisiones por vendedor -------------------------------------------------
//
// La comisión se calcula sobre el MARGEN de la venta: la suma de (total de
// línea - costo) de las líneas con costo conocido. Las líneas sin costo no
// aportan margen y se informan aparte, igual que en el reporte de ganancia.
// La regla por usuario prevalece sobre la regla por rol; sin regla no hay
// comisión (porcentaje nulo en el resultado).

export type CommissionRuleLike = {
  userId?: string | null
  role?: string | null
  percentPyg?: number | null
}

export type SellerProfile = { name?: string | null; role?: string | null }

export type CommissionSellerRow = {
  sellerId: string
  sellerName: string
  role: string | null
  orders: number
  totalPyg: number
  marginPyg: number
  salesWithoutCostPyg: number
  linesWithoutCost: number
  commissionPct: number | null
  commissionPyg: number
}

export function aggregateCommissions(
  orders: OrderLike[],
  rules: CommissionRuleLike[],
  sellers: Record<string, SellerProfile> = {},
): { sellers: CommissionSellerRow[]; totals: { totalPyg: number; marginPyg: number; commissionPyg: number } } {
  const ruleByUser = new Map<string, number>()
  const ruleByRole = new Map<string, number>()
  for (const rule of rules) {
    const percent = porcentaje(rule.percentPyg)
    if (percent === null) continue
    if (rule.userId) ruleByUser.set(rule.userId, percent)
    if (rule.role) ruleByRole.set(rule.role, percent)
  }

  type AcumuladorComision = Omit<CommissionSellerRow, 'commissionPct' | 'commissionPyg'>
  const acumulados = new Map<string, AcumuladorComision>()
  const acumular = (sellerId: string, label: string, role: string | null): AcumuladorComision => {
    let acumulador = acumulados.get(sellerId)
    if (!acumulador) {
      acumulador = { sellerId, sellerName: label, role, orders: 0, totalPyg: 0, marginPyg: 0, salesWithoutCostPyg: 0, linesWithoutCost: 0 }
      acumulados.set(sellerId, acumulador)
    } else if (acumulador.sellerName === 'Sin vendedor' && label !== 'Sin vendedor') {
      acumulador.sellerName = label
    }
    return acumulador
  }

  for (const orden of orders) {
    if (orden.status === 'CANCELLED') continue
    const sellerId = orden.sellerId || 'sin-vendedor'
    const profile = sellers[sellerId]
    const acumulador = acumular(sellerId, orden.sellerName?.trim() || profile?.name?.trim() || 'Sin vendedor', profile?.role ?? null)
    acumulador.orders += 1
    acumulador.totalPyg = suma(acumulador.totalPyg, entero(orden.totalPyg) ?? 0)
    const items = Array.isArray(orden.items) ? orden.items : []
    let marginOrden = 0
    for (const item of items) {
      const cantidad = entero(item.quantity, 1) ?? 0
      const totalLinea = entero(item.totalPyg) ?? 0
      const costoUnitario = item.unitCostPyg === null || item.unitCostPyg === undefined ? null : entero(item.unitCostPyg)
      if (costoUnitario === null) {
        acumulador.linesWithoutCost += 1
        acumulador.salesWithoutCostPyg = suma(acumulador.salesWithoutCostPyg, totalLinea)
        continue
      }
      marginOrden = suma(marginOrden, Math.max(0, totalLinea - costoUnitario * cantidad))
    }
    acumulador.marginPyg = suma(acumulador.marginPyg, marginOrden)
  }

  const sellersRows: CommissionSellerRow[] = [...acumulados.values()].map(acumulador => {
    const percent = acumulador.sellerId === 'sin-vendedor' ? null : ruleByUser.get(acumulador.sellerId) ?? ruleByRole.get(acumulador.role ?? '') ?? null
    return {
      ...acumulador,
      commissionPct: percent,
      commissionPyg: percent === null ? 0 : Math.round((acumulador.marginPyg * percent) / 100),
    }
  })
  sellersRows.sort((a, b) => b.totalPyg - a.totalPyg || a.sellerName.localeCompare(b.sellerName))

  const totals = sellersRows.reduce(
    (sum, row) => ({
      totalPyg: suma(sum.totalPyg, row.totalPyg),
      marginPyg: suma(sum.marginPyg, row.marginPyg),
      commissionPyg: suma(sum.commissionPyg, row.commissionPyg),
    }),
    { totalPyg: 0, marginPyg: 0, commissionPyg: 0 },
  )

  return { sellers: sellersRows, totals }
}

export class ReportInputError extends Error {}

function entero(value: unknown, minimo = 0): number | null {
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isSafeInteger(number) || number < minimo || number > INT_MAX) return null
  return number
}

// La comisión admite porcentajes decimales (0–100 con hasta 2 cifras); los
// importes siguen siendo enteros de guaraníes.
function porcentaje(value: unknown): number | null {
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number) || number < 0 || number > 100) return null
  return Math.round(number * 100) / 100
}

function suma(actual: number, delta: number): number {
  const total = actual + delta
  if (!Number.isSafeInteger(total) || total < 0 || total > INT_MAX) {
    throw new ReportInputError('Los importes del período exceden el rango permitido.')
  }
  return total
}

function partesDeFecha(value: unknown): { y: number; m: number; d: number } | null {
  if (typeof value !== 'string') return null
  const match = DATE_RE.exec(value.trim())
  if (!match) return null
  const y = Number(match[1])
  const m = Number(match[2])
  const d = Number(match[3])
  const prueba = new Date(Date.UTC(y, m - 1, d))
  if (prueba.getUTCFullYear() !== y || prueba.getUTCMonth() !== m - 1 || prueba.getUTCDate() !== d) return null
  return { y, m, d }
}

export function esFechaValida(value: unknown): boolean {
  return partesDeFecha(value) !== null
}

/** Día local (YYYY-MM-DD) de un instante, según el desfase horario de la empresa. */
export function localDayKey(value: Date | string | number, offsetMinutes: number): string {
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime()
  if (!Number.isFinite(ms)) throw new ReportInputError('Fecha inválida en el reporte.')
  return new Date(ms + offsetMinutes * 60000).toISOString().slice(0, 10)
}

function diaLocalAHoraUtc(dateOnly: string, offsetMinutes: number): number {
  const partes = partesDeFecha(dateOnly)
  if (!partes) throw new ReportInputError('Fecha inválida: se espera YYYY-MM-DD.')
  return Date.UTC(partes.y, partes.m - 1, partes.d) - offsetMinutes * 60000
}

/** Límites UTC del rango local: `start` inclusive, `end` exclusivo. */
export function dayBounds(from: string, to: string, offsetMinutes: number): { start: Date; end: Date } {
  const start = diaLocalAHoraUtc(from, offsetMinutes)
  const end = diaLocalAHoraUtc(to, offsetMinutes) + DAY_MS
  return { start: new Date(start), end: new Date(end) }
}

export function diasDelRango(from: string, to: string): number {
  return Math.round((diaLocalAHoraUtc(to, 0) - diaLocalAHoraUtc(from, 0)) / DAY_MS) + 1
}

function correrDias(dateOnly: string, dias: number): string {
  const partes = partesDeFecha(dateOnly)
  if (!partes) throw new ReportInputError('Fecha inválida: se espera YYYY-MM-DD.')
  return new Date(Date.UTC(partes.y, partes.m - 1, partes.d + dias)).toISOString().slice(0, 10)
}

export function parseReportQuery(
  params: URLSearchParams,
  now: Date = new Date(),
): { ok: true; value: ReportQuery } | { ok: false; error: string } {
  const tzParam = params.get('tzOffset')
  const offsetMinutes = tzParam === null || tzParam === '' ? DEFAULT_OFFSET_MINUTES : Number(tzParam)
  if (!Number.isSafeInteger(offsetMinutes) || offsetMinutes < MIN_OFFSET_MINUTES || offsetMinutes > MAX_OFFSET_MINUTES) {
    return { ok: false, error: 'El desfase horario debe ser un entero entre -720 y 840 minutos.' }
  }

  const hoy = localDayKey(now, offsetMinutes)
  const from = (params.get('from') || '').trim() || correrDias(hoy, -29)
  const to = (params.get('to') || '').trim() || hoy
  if (!esFechaValida(from) || !esFechaValida(to)) return { ok: false, error: 'Las fechas deben tener el formato YYYY-MM-DD.' }
  if (from > to) return { ok: false, error: 'La fecha inicial no puede ser posterior a la final.' }
  if (diasDelRango(from, to) > MAX_RANGE_DAYS) {
    return { ok: false, error: `El período no puede superar ${MAX_RANGE_DAYS} días.` }
  }

  const groupByParam = (params.get('groupBy') || 'product').trim() || 'product'
  if (!(REPORT_GROUP_BY as readonly string[]).includes(groupByParam)) {
    return { ok: false, error: `Agrupación inválida. Opciones: ${REPORT_GROUP_BY.join(', ')}.` }
  }

  // Corte de `groupBy=payments`: cuenta (predeterminado), procesadora o medio.
  const paymentsByParam = (params.get('paymentsBy') || 'account').trim() || 'account'
  if (!(PAYMENTS_BY as readonly string[]).includes(paymentsByParam)) {
    return { ok: false, error: `Corte de pagos inválido. Opciones: ${PAYMENTS_BY.join(', ')}.` }
  }

  return { ok: true, value: { from, to, groupBy: groupByParam as ReportGroupBy, offsetMinutes, paymentsBy: paymentsByParam as PaymentsBy } }
}

type Acumulador = {
  key: string
  label: string
  orderIds: Set<string>
  customerIds: Set<string>
  newIds: Set<string>
  returningIds: Set<string>
  refundedPyg: number
  units: number
  grossPyg: number
  discountPyg: number
  deliveryPyg: number
  totalPyg: number
  collectedPyg: number
  costPyg: number
  profitPyg: number
  salesWithCostPyg: number
  salesWithoutCostPyg: number
  linesWithoutCost: number
  commissionPyg: number
  paidOrders: number
  pendingOrders: number
}

function nuevoAcumulador(key: string, label: string): Acumulador {
  return {
    key,
    label,
    orderIds: new Set<string>(),
    customerIds: new Set<string>(),
    newIds: new Set<string>(),
    returningIds: new Set<string>(),
    refundedPyg: 0,
    units: 0,
    grossPyg: 0,
    discountPyg: 0,
    deliveryPyg: 0,
    totalPyg: 0,
    collectedPyg: 0,
    costPyg: 0,
    profitPyg: 0,
    salesWithCostPyg: 0,
    salesWithoutCostPyg: 0,
    linesWithoutCost: 0,
    commissionPyg: 0,
    paidOrders: 0,
    pendingOrders: 0,
  }
}

function obtener(grupos: Map<string, Acumulador>, key: string, label: string): Acumulador {
  let acumulador = grupos.get(key)
  if (!acumulador) {
    acumulador = nuevoAcumulador(key, label)
    grupos.set(key, acumulador)
  } else if (acumulador.label === 'Sin categoría' || acumulador.label === 'Producto sin nombre') {
    if (label !== acumulador.label) acumulador.label = label
  }
  return acumulador
}

function cerrar(acumulador: Acumulador): ReportGroup {
  const { orderIds, customerIds, newIds, returningIds, salesWithCostPyg, paidOrders, pendingOrders, ...resto } = acumulador
  void salesWithCostPyg
  void paidOrders
  void pendingOrders
  return {
    ...resto,
    orders: orderIds.size,
    customers: customerIds.size,
    newCustomers: newIds.size,
    returningCustomers: returningIds.size,
    pendingPyg: Math.max(0, resto.totalPyg - resto.collectedPyg),
    netProfitPyg: Math.max(0, resto.profitPyg - resto.commissionPyg),
  }
}

function cerrarTotales(acumulador: Acumulador): ReportTotals {
  const group = cerrar(acumulador)
  return {
    orders: group.orders,
    units: group.units,
    grossPyg: group.grossPyg,
    discountPyg: group.discountPyg,
    deliveryPyg: group.deliveryPyg,
    totalPyg: group.totalPyg,
    collectedPyg: group.collectedPyg,
    pendingPyg: group.pendingPyg,
    costPyg: group.costPyg,
    profitPyg: group.profitPyg,
    salesWithCostPyg: acumulador.salesWithCostPyg,
    salesWithoutCostPyg: group.salesWithoutCostPyg,
    linesWithoutCost: group.linesWithoutCost,
    marginPct: acumulador.salesWithCostPyg > 0
      ? Math.round((acumulador.profitPyg / acumulador.salesWithCostPyg) * 1000) / 10
      : null,
    commissionPyg: group.commissionPyg,
    netProfitPyg: group.netProfitPyg,
    netMarginPct: acumulador.salesWithCostPyg > 0
      ? Math.round((Math.max(0, acumulador.profitPyg - acumulador.commissionPyg) / acumulador.salesWithCostPyg) * 1000) / 10
      : null,
    refundedPyg: group.refundedPyg,
    paidOrders: acumulador.paidOrders,
    pendingOrders: acumulador.pendingOrders,
  }
}

/**
 * Curva ABC sobre filas con `grossPyg` (por defecto las de `groupBy=product`):
 * ordena de mayor a menor, acumula el porcentaje y clasifica A ≤ 80%,
 * B ≤ 95% y C el resto. La clasificación vive en el servidor para que la vista
 * ejecutiva y la extendida usen el mismo criterio (#171, fase 2 de #145).
 * El porcentaje acumulado se redondea a un decimal para mostrarlo tal cual.
 */
export function curvaAbc<T extends { grossPyg: number }>(
  rows: T[],
  cortes: { a?: number; b?: number } = {},
): (T & { accumulatedPct: number; abcClass: 'A' | 'B' | 'C' })[] {
  const corteA = cortes.a ?? 80
  const corteB = cortes.b ?? 95
  const ordenadas = [...rows].sort((x, y) => y.grossPyg - x.grossPyg)
  const total = ordenadas.reduce((suma, fila) => suma + fila.grossPyg, 0)
  let acumulado = 0
  return ordenadas.map((fila) => {
    acumulado += fila.grossPyg
    const accumulatedPct = total > 0 ? Math.round((acumulado / total) * 1000) / 10 : 0
    // Sin ventas no hay curva que clasificar: todo queda en C en vez de A.
    const abcClass: 'A' | 'B' | 'C' = total > 0 && accumulatedPct <= corteA ? 'A' : total > 0 && accumulatedPct <= corteB ? 'B' : 'C'
    return { ...fila, accumulatedPct, abcClass }
  })
}

type HechoOrden = {
  orden: OrderLike
  items: OrderItemLike[]
  unidades: number
  cobrado: number
  costo: number
  conCosto: number
  sinCosto: number
  lineasSinCosto: number
  comision: number
}

function analizarOrden(orden: OrderLike): HechoOrden {
  const items = Array.isArray(orden.items) ? orden.items : []
  const payments = Array.isArray(orden.payments) ? orden.payments : []

  let unidades = 0
  let costo = 0
  let conCosto = 0
  let sinCosto = 0
  let lineasSinCosto = 0
  for (const item of items) {
    const cantidad = entero(item.quantity, 1) ?? 0
    const totalLinea = entero(item.totalPyg) ?? 0
    unidades = suma(unidades, cantidad)
    const costoUnitario = item.unitCostPyg === null || item.unitCostPyg === undefined ? null : entero(item.unitCostPyg)
    if (costoUnitario === null) {
      lineasSinCosto += 1
      sinCosto = suma(sinCosto, totalLinea)
      continue
    }
    costo = suma(costo, costoUnitario * cantidad)
    conCosto = suma(conCosto, totalLinea)
  }

  // Solo los pagos confirmados son cobro real.
  let cobrado = 0
  let comision = 0
  for (const pago of payments) {
    if ((pago.status ?? 'CONFIRMED') !== 'CONFIRMED') continue
    const monto = entero(pago.amountPyg) ?? 0
    cobrado = suma(cobrado, monto)
    // La comisión se congela en `feePyg` desde la cuenta de pago. Si la venta
    // es histórica y no conserva esa foto, no se estima para no alterar margen.
    const fee = entero((pago as PaymentLike & { feePyg?: number | null }).feePyg ?? 0) ?? 0
    comision = suma(comision, fee)
  }

  return { orden, items, unidades, cobrado, costo, conCosto, sinCosto, lineasSinCosto, comision }
}

function acumularOrden(acumulador: Acumulador, hecho: HechoOrden) {
  const { orden } = hecho
  acumulador.orderIds.add(orden.id)
  acumulador.units = suma(acumulador.units, hecho.unidades)
  acumulador.grossPyg = suma(acumulador.grossPyg, entero(orden.subtotalPyg) ?? 0)
  acumulador.discountPyg = suma(acumulador.discountPyg, entero(orden.discountPyg ?? 0) ?? 0)
  acumulador.deliveryPyg = suma(acumulador.deliveryPyg, entero(orden.deliveryPyg ?? 0) ?? 0)
  acumulador.totalPyg = suma(acumulador.totalPyg, entero(orden.totalPyg) ?? 0)
  acumulador.collectedPyg = suma(acumulador.collectedPyg, hecho.cobrado)
  acumulador.costPyg = suma(acumulador.costPyg, hecho.costo)
  acumulador.profitPyg = suma(acumulador.profitPyg, Math.max(0, hecho.conCosto - hecho.costo))
  acumulador.salesWithCostPyg = suma(acumulador.salesWithCostPyg, hecho.conCosto)
  acumulador.salesWithoutCostPyg = suma(acumulador.salesWithoutCostPyg, hecho.sinCosto)
  acumulador.linesWithoutCost += hecho.lineasSinCosto
  acumulador.commissionPyg = suma(acumulador.commissionPyg, hecho.comision)
  const saldo = Math.max(0, (entero(orden.totalPyg) ?? 0) - hecho.cobrado)
  if (saldo > 0) acumulador.pendingOrders += 1
  else acumulador.paidOrders += 1
}

function claveDeItem(item: OrderItemLike): string {
  if (item.productId) return item.productId
  const descripcion = (item.description || '').trim().toLowerCase()
  return descripcion ? `desc:${descripcion}` : 'sin-descripcion'
}

function claveDeCategoria(item: OrderItemLike): string {
  return (item.category || '').trim().toLowerCase() || 'sin-categoria'
}

/**
 * Resume órdenes ya cargadas. Nunca inventa costos: la ganancia se calcula
 * solo sobre las líneas con `unitCostPyg` conocido y el resto queda informado
 * en `linesWithoutCost` / `salesWithoutCostPyg`.
 */
export function aggregateReport(
  orders: OrderLike[],
  options: { groupBy: ReportGroupBy; offsetMinutes: number; firstOrderMonth?: Map<string, string>; paymentsBy?: PaymentsBy },
): ReportResult {
  const totales = nuevoAcumulador('total', 'Total')
  const grupos = new Map<string, Acumulador>()
  const porLinea = (LINE_LEVEL_GROUPS as readonly string[]).includes(options.groupBy)

  // Pagos por pasarela/cuenta: transacciones, bruto, reembolsado y neto.
  if (options.groupBy === 'payments') {
    const corte = options.paymentsBy || 'account'
    const claveDePago = (pago: PaymentLike): { key: string; label: string } => {
      if (corte === 'processor') {
        const processor = (pago.processor || '').trim()
        return processor ? { key: processor.toLowerCase(), label: processor } : { key: 'sin-procesadora', label: 'Sin procesadora' }
      }
      if (corte === 'method') {
        const method = (pago.method || '').trim()
        return method ? { key: method.toLowerCase(), label: method } : { key: 'sin-metodo', label: 'Sin método' }
      }
      const accountName = (pago.accountName || '').trim()
      const method = (pago.method || '').trim()
      if (accountName) return { key: (pago.accountId || accountName).trim().toLowerCase(), label: accountName }
      return method ? { key: `metodo:${method.toLowerCase()}`, label: method } : { key: 'sin-metodo', label: 'Sin método' }
    }
    const acumularPago = (acumulador: Acumulador, pago: PaymentLike) => {
      const monto = entero(pago.amountPyg) ?? 0
      if (pago.status === 'REFUNDED') {
        acumulador.refundedPyg = suma(acumulador.refundedPyg, monto)
        return
      }
      acumulador.orderIds.add(`pago:${acumulador.key}:${acumulador.orderIds.size}`)
      acumulador.units = suma(acumulador.units, 1)
      acumulador.grossPyg = suma(acumulador.grossPyg, monto)
      acumulador.totalPyg = suma(acumulador.totalPyg, monto)
      acumulador.collectedPyg = suma(acumulador.collectedPyg, monto)
    }
    for (const orden of orders) {
      if (orden.status === 'CANCELLED') continue
      for (const pago of Array.isArray(orden.payments) ? orden.payments : []) {
        const { key, label } = claveDePago(pago)
        acumularPago(obtener(grupos, key, label), pago)
        acumularPago(totales, pago)
      }
    }
    const resultado = [...grupos.values()].map(cerrar)
    resultado.sort((a, b) => b.totalPyg - a.totalPyg || a.label.localeCompare(b.label))
    const neto = Math.max(0, totales.totalPyg - totales.refundedPyg)
    return {
      totals: {
        orders: totales.units,
        units: totales.units,
        grossPyg: totales.grossPyg,
        discountPyg: 0,
        deliveryPyg: 0,
        totalPyg: neto,
        collectedPyg: neto,
        pendingPyg: 0,
        costPyg: 0,
        profitPyg: 0,
        salesWithCostPyg: 0,
        salesWithoutCostPyg: 0,
        linesWithoutCost: 0,
        marginPct: null,
        commissionPyg: 0,
        netProfitPyg: 0,
        netMarginPct: null,
        refundedPyg: totales.refundedPyg,
        paidOrders: 0,
        pendingOrders: 0,
      },
      groups: resultado,
    }
  }

  // Clientes nuevos vs habituales por mes. Un cliente es "nuevo" en el mes de
  // su primera orden histórica; el resto de sus órdenes cuentan como habitual.
  if (options.groupBy === 'newCustomers') {
    const mesDe = (orden: OrderLike) => localDayKey(orden.createdAt, options.offsetMinutes).slice(0, 7)
    for (const orden of orders) {
      if (orden.status === 'CANCELLED') continue
      const hecho = analizarOrden(orden)
      acumularOrden(totales, hecho)
      const mes = mesDe(orden)
      const acumulador = obtener(grupos, mes, mes)
      acumularOrden(acumulador, hecho)
      const primero = options.firstOrderMonth?.get(orden.customerId || '')
      const nuevo = Boolean(orden.customerId && primero && primero === mes)
      if (orden.customerId) {
        acumulador.customerIds.add(orden.customerId)
        ;(nuevo ? acumulador.newIds : acumulador.returningIds).add(orden.customerId)
      } else {
        acumulador.returningIds.add(`sin-cliente:${orden.id}`)
      }
    }
    const resultado = [...grupos.values()].map(cerrar)
    resultado.sort((a, b) => a.key.localeCompare(b.key))
    return { totals: cerrarTotales(totales), groups: resultado }
  }

  for (const orden of orders) {
    if (orden.status === 'CANCELLED') continue
    const hecho = analizarOrden(orden)
    acumularOrden(totales, hecho)

    if (porLinea) {
      // Producto / categoría: la orden suma a cada producto que contiene, pero
      // el descuento global y los cobros pertenecen a la orden y no se reparten.
      for (const item of hecho.items) {
        const key = options.groupBy === 'category' ? claveDeCategoria(item) : claveDeItem(item)
        const label = options.groupBy === 'category'
          ? (item.category?.trim() || 'Sin categoría')
          : (item.productName?.trim() || item.description?.trim() || 'Producto sin nombre')
        const acumulador = obtener(grupos, key, label)
        const cantidad = entero(item.quantity, 1) ?? 0
        const totalLinea = entero(item.totalPyg) ?? 0
        acumulador.orderIds.add(orden.id)
        acumulador.units = suma(acumulador.units, cantidad)
        acumulador.grossPyg = suma(acumulador.grossPyg, totalLinea)
        acumulador.totalPyg = suma(acumulador.totalPyg, totalLinea)
        const costoUnitario = item.unitCostPyg === null || item.unitCostPyg === undefined ? null : entero(item.unitCostPyg)
        if (costoUnitario === null) {
          acumulador.linesWithoutCost += 1
          acumulador.salesWithoutCostPyg = suma(acumulador.salesWithoutCostPyg, totalLinea)
          continue
        }
        const costo = costoUnitario * cantidad
        acumulador.costPyg = suma(acumulador.costPyg, costo)
        acumulador.profitPyg = suma(acumulador.profitPyg, Math.max(0, totalLinea - costo))
        acumulador.salesWithCostPyg = suma(acumulador.salesWithCostPyg, totalLinea)
      }
      continue
    }

    if (options.groupBy === 'day') {
      const key = localDayKey(orden.createdAt, options.offsetMinutes)
      acumularOrden(obtener(grupos, key, key), hecho)
      continue
    }

    if (options.groupBy === 'branch') {
      acumularOrden(obtener(grupos, orden.branchId || 'sin-sucursal', orden.branchName?.trim() || 'Sin sucursal'), hecho)
      continue
    }

    if (options.groupBy === 'customers') {
      acumularOrden(obtener(grupos, orden.customerId || 'sin-cliente', orden.customerName?.trim() || 'Cliente sin nombre'), hecho)
      continue
    }

    acumularOrden(obtener(grupos, orden.sellerId || 'sin-vendedor', orden.sellerName?.trim() || 'Sin vendedor'), hecho)
  }

  const resultado = [...grupos.values()].map(cerrar)
  resultado.sort((a, b) => {
    if (options.groupBy === 'day') return a.key.localeCompare(b.key)
    const referencia = porLinea ? b.grossPyg - a.grossPyg : b.totalPyg - a.totalPyg
    return referencia || a.label.localeCompare(b.label)
  })

  return { totals: cerrarTotales(totales), groups: resultado }
}
