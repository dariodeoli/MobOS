// #250 F1 · Motor de demanda del Centro de Abastecimiento.
//
// Convierte eventos reales en necesidades del panel «Por comprar»:
//   · venta confirmada sin stock (producto sin unidades / venta sobre pedido)
//   · cantidad vendida > stock (venta offline que descontó de menos)
//   · reserva/backorder sin unidad (la diferencia que falta)
//   · producto bajo punto de reposición
//   · pedido comprometido con fecha de entrega (prioridad por la promesa)
//
// Reglas (#250 §3, §5, §14): una reserva de una unidad existente NO genera
// compra (solo la diferencia); la consolidación nunca mezcla variante/condición;
// no se crea stock acá (eso pasa recién en la recepción). Las automáticas usan
// `dedupeKey` para que repetir el evento no duplique la necesidad.
import type { Prisma } from '@prisma/client'
import { prioridadMayor, type NecesidadOrigen } from './supply'
import { margenEstimadoDeNecesidad, prioridadDeVenta } from './supply-priority'

// Centros de compra del plan (§4): CDE · USA · Locales · futuros. Se acepta
// cualquier código corto para sumar centros nuevos sin tocar el motor.
export const NECESIDAD_CENTROS = ['CDE', 'USA', 'LOCAL'] as const
export type NecesidadCentro = (typeof NECESIDAD_CENTROS)[number]

export const NECESIDAD_CENTRO_LABEL: Record<string, string> = {
  CDE: 'CDE · Ciudad del Este',
  USA: 'USA · Miami',
  LOCAL: 'Local · Asunción',
}

export function normalizarCentro(value: unknown): { ok: true; centro: string | null } | { ok: false; error: string } {
  if (value === undefined || value === null || value === '') return { ok: true, centro: null }
  if (typeof value !== 'string') return { ok: false, error: 'El centro de compra no es válido.' }
  const centro = value.trim().toUpperCase()
  if (!/^[A-Z0-9]{2,8}$/.test(centro)) return { ok: false, error: 'El centro de compra no es válido (2 a 8 letras o números).' }
  return { ok: true, centro }
}

const DOS_DIAS = 2 * 86400000
const SIETE_DIAS = 7 * 86400000

/**
 * Prioridad por la fecha comprometida: vencida ⇒ URGENTE; en 48 h ⇒ ALTA;
 * en la semana ⇒ NORMAL; más lejos o sin fecha ⇒ NORMAL (nunca BAJA sola: una
 * venta sin stock sin fecha no es de baja prioridad).
 */
export function prioridadPorPromesa(prometida: Date | string | null | undefined, ahora = new Date()): 'URGENTE' | 'ALTA' | 'NORMAL' {
  if (!prometida) return 'NORMAL'
  const fecha = prometida instanceof Date ? prometida : new Date(String(prometida))
  if (Number.isNaN(fecha.getTime())) return 'NORMAL'
  const falta = fecha.getTime() - ahora.getTime()
  if (falta < 0) return 'URGENTE'
  if (falta <= DOS_DIAS) return 'ALTA'
  return 'NORMAL'
}

/** Clave de semana ISO para las automáticas periódicas (mínimos). */
export function semanaClave(ahora = new Date()): string {
  const fecha = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate()))
  const dia = fecha.getUTCDay() || 7
  fecha.setUTCDate(fecha.getUTCDate() + 4 - dia)
  const inicio = new Date(Date.UTC(fecha.getUTCFullYear(), 0, 1))
  const semana = Math.ceil(((fecha.getTime() - inicio.getTime()) / 86400000 + 1) / 7)
  return `${fecha.getUTCFullYear()}-W${String(semana).padStart(2, '0')}`
}

const diaClave = (ahora: Date) => ahora.toISOString().slice(0, 10)

export type DemandaNecesidad = {
  productId: string
  condition: string
  quantity: number
  source: NecesidadOrigen
  priority: string
  branchId: string | null
  promisedAt: Date | null
  orderId?: string | null
  orderItemId?: string | null
  customerId?: string | null
  notes?: string | null
  dedupeKey: string
  origin?: string | null
}

export type ItemDePedido = {
  productId: string
  condition?: string | null
  quantity: number
  stockPending?: number
  serialsPending?: number
  stockFaltante?: number
  orderItemId?: string | null
  // FIN (#254): precio de venta y costo del producto para pesar el margen en la
  // prioridad de la demanda (una venta que deja plata va antes que una flaca).
  unitPricePyg?: number | null
  costPyg?: number | null
}

/**
 * Necesidades de una venta/pedido. La cantidad es lo que quedó sin cubrir:
 * `stockPending` (producto sin unidades), `serialsPending` (serializado sin
 * unidad) y el faltante de una venta offline (se vendió más que el stock).
 * Con fecha prometida el origen es ORDER_COMMITTED; la prioridad combina la
 * promesa con la venta (cobrada y margen esperado, FIN #254).
 */
export function demandasDePedido({ orderId, items = [], promisedAt = null, customerId = null, branchId = null, origen = null, ventaConfirmada = false, ahora = new Date() }: {
  orderId: string
  items?: ItemDePedido[]
  promisedAt?: Date | string | null
  customerId?: string | null
  branchId?: string | null
  origen?: string | null
  /** Hay al menos un pago confirmado de la venta (no es una reserva). */
  ventaConfirmada?: boolean
  ahora?: Date
}): DemandaNecesidad[] {
  const promesa = promisedAt ? (promisedAt instanceof Date ? promisedAt : new Date(String(promisedAt))) : null
  const prometidaValida = promesa && !Number.isNaN(promesa.getTime()) ? promesa : null
  const prioridadPromesa = prioridadPorPromesa(prometidaValida, ahora)
  const demandas: DemandaNecesidad[] = []
  for (const item of items) {
    if (!item?.productId) continue
    const faltanteOffline = Math.max(0, Math.round(Number(item.stockFaltante) || 0))
    const pendienteSobrePedido = Math.max(0, Math.round(Number(item.stockPending) || 0)) + Math.max(0, Math.round(Number(item.serialsPending) || 0))
    const cantidad = faltanteOffline + pendienteSobrePedido
    if (cantidad < 1) continue
    const condition = String(item.condition || 'NEW').toUpperCase()
    const soloFaltanteOffline = faltanteOffline > 0 && pendienteSobrePedido === 0
    const source: NecesidadOrigen = soloFaltanteOffline ? 'QUANTITY_OVER_STOCK' : prometidaValida ? 'ORDER_COMMITTED' : 'SALE_NO_STOCK'
    const margenPyg = margenEstimadoDeNecesidad({ precioUnitarioPyg: item.unitPricePyg, costoUnitarioPyg: item.costPyg, cantidad })
    const prioridadVenta = prioridadDeVenta(soloFaltanteOffline ? 'ALTA' : 'NORMAL', { ventaConfirmada, margenPyg })
    demandas.push({
      productId: item.productId,
      condition,
      quantity: cantidad,
      source,
      priority: prioridadMayor(prioridadVenta, prioridadPromesa),
      branchId: branchId || null,
      promisedAt: prometidaValida,
      orderId,
      orderItemId: item.orderItemId || null,
      customerId: customerId || null,
      notes: soloFaltanteOffline ? 'La venta superó el stock disponible (venta offline).' : null,
      dedupeKey: `PEDIDO:${orderId}:${item.productId}:${condition}`,
      origin: origen,
    })
  }
  return demandas
}

/**
 * Reserva/backorder sin unidad: solo la diferencia que falta (una reserva de
 * unidades existentes no genera compra). Se deduplica por producto, sucursal,
 * cliente y día para no repetir la misma demanda.
 */
export function demandaDeReserva({ productId, condition = 'NEW', branchId = null, faltante, customerId = null, customerName = '', reservedUntil = null, origen = null, ahora = new Date() }: {
  productId: string
  condition?: string | null
  branchId?: string | null
  faltante: number
  customerId?: string | null
  customerName?: string | null
  reservedUntil?: Date | string | null
  origen?: string | null
  ahora?: Date
}): DemandaNecesidad | null {
  const cantidad = Math.round(Number(faltante) || 0)
  if (!productId || cantidad < 1) return null
  const condicion = String(condition || 'NEW').toUpperCase()
  const claveCliente = customerId || String(customerName || '').trim().toLowerCase() || 'sin-cliente'
  return {
    productId,
    condition: condicion,
    quantity: cantidad,
    source: 'RESERVATION_NO_STOCK',
    priority: prioridadPorPromesa(reservedUntil, ahora),
    branchId: branchId || null,
    promisedAt: reservedUntil ? new Date(String(reservedUntil)) : null,
    customerId: customerId || null,
    notes: `Reserva sin unidad${customerName ? ` de ${customerName}` : ''}: falta la diferencia.`,
    dedupeKey: `RESERVA:${productId}:${condicion}:${branchId || ''}:${claveCliente}:${diaClave(ahora)}`,
    origin: origen,
  }
}

/**
 * Producto bajo el punto de reposición: repone hasta el punto (mínimo 1).
 * Una sola necesidad por producto/sucursal/condición y semana.
 */
export function demandaBajoMinimo({ productId, condition = 'NEW', branchId = null, stock = 0, reorderPoint, origen = null, ahora = new Date() }: {
  productId: string
  condition?: string | null
  branchId?: string | null
  stock: number
  reorderPoint: number | null | undefined
  origen?: string | null
  ahora?: Date
}): DemandaNecesidad | null {
  if (!productId || reorderPoint === null || reorderPoint === undefined) return null
  const punto = Math.round(Number(reorderPoint))
  if (!Number.isFinite(punto) || punto < 1) return null
  const actual = Math.max(0, Math.round(Number(stock) || 0))
  if (actual > punto) return null
  const condicion = String(condition || 'NEW').toUpperCase()
  return {
    productId,
    condition: condicion,
    quantity: Math.max(1, punto - actual + 1),
    source: 'BELOW_REORDER',
    priority: actual === 0 ? 'ALTA' : 'NORMAL',
    branchId: branchId || null,
    promisedAt: null,
    notes: `Stock ${actual} bajo el punto de reposición (${punto}).`,
    dedupeKey: `MINIMO:${productId}:${condicion}:${branchId || ''}:${semanaClave(ahora)}`,
    origin: origen,
  }
}

/**
 * Persiste las demandas (dentro de la transacción del evento) sin duplicar:
 * el `dedupeKey` es único por empresa y una carrera se saltea sin romper la
 * venta. Cada necesidad creada deja su auditoría.
 */
export async function crearDemandas(tx: Prisma.TransactionClient, tenantId: string, demandas: DemandaNecesidad[], creadoPorId: string): Promise<string[]> {
  const ids: string[] = []
  for (const demanda of demandas) {
    if (!demanda?.productId || demanda.quantity < 1) continue
    try {
      const fila = await tx.supplyNeed.create({
        data: {
          tenantId,
          branchId: demanda.branchId || null,
          productId: demanda.productId,
          condition: demanda.condition as never,
          quantity: demanda.quantity,
          source: demanda.source,
          priority: demanda.priority,
          status: 'ABIERTA',
          promisedAt: demanda.promisedAt || null,
          orderId: demanda.orderId || null,
          orderItemId: demanda.orderItemId || null,
          customerId: demanda.customerId || null,
          notes: demanda.notes || null,
          origin: demanda.origin || null,
          dedupeKey: demanda.dedupeKey,
          createdById: creadoPorId,
        },
      })
      await tx.auditLog.create({
        data: {
          tenantId,
          userId: creadoPorId,
          action: 'SUPPLY_NEED_CREATED',
          entity: 'SupplyNeed',
          entityId: fila.id,
          metadata: { source: demanda.source, quantity: demanda.quantity, productId: demanda.productId, branchId: demanda.branchId, orderId: demanda.orderId || null, promisedAt: demanda.promisedAt ? demanda.promisedAt.toISOString() : null, dedupeKey: demanda.dedupeKey },
        },
      })
      ids.push(fila.id)
    } catch (cause) {
      // P2002: la necesidad ya existe (otra corrida la creó). No es un error.
      const codigo = (cause as { code?: string } | null)?.code
      if (codigo !== 'P2002') throw cause
    }
  }
  return ids

}
