// #279 (A4) · Vender en tránsito: lógica compartida de las asignaciones futuras.
//
// Una unidad que viaja (traslado interno o compra en camino) ya existe como
// `InventoryUnit` con status IN_TRANSIT en la sucursal destino. Apartarla crea
// una `TransitAssignment` **viva** (el índice único parcial impide dos), así no
// se puede doble-asignar esa unidad futura. Al recibirla, el IMEI se vincula
// solo a la venta/pedido que la esperaba.
import type { Prisma } from '@prisma/client'
import { syncOrderItemSerials } from './order-serials'

/** Estados de una asignación futura (una sola viva por unidad). */
export const TRANSIT_ESTADOS = ['ASIGNADA', 'VINCULADA', 'LIBERADA'] as const

export type UnidadParaVincular = { id: string; serial: string; branchId?: string | null }

type Tx = Prisma.TransactionClient

/**
 * Vincula la asignación viva de una unidad que acaba de llegar: la línea del
 * pedido recibe el IMEI y la asignación queda VINCULADA. Sin asignación
 * devuelve null (la recepción sigue como siempre).
 */
export async function vincularAsignacionAlRecibir(
  tx: Tx,
  { tenantId, unit, userId }: { tenantId: string; unit: UnidadParaVincular; userId: string | null },
) {
  const asignacion = await tx.transitAssignment.findFirst({
    where: { tenantId, unitId: unit.id, status: 'ASIGNADA' },
    orderBy: { createdAt: 'desc' },
  })
  if (!asignacion) return null
  // El pedido que la esperaba recibe su serial: el JSON de la línea es el dato
  // que muestra el comprobante y la tabla indexada responde "¿qué venta tiene
  // este IMEI?" (se sincronizan juntos, idempotente por reintentos).
  if (asignacion.orderItemId) {
    const item = await tx.orderItem.findFirst({ where: { id: asignacion.orderItemId }, select: { id: true, serials: true, serialsPending: true } })
    if (item) {
      const previos = Array.isArray(item.serials) ? (item.serials as unknown[]).filter((serial): serial is string => typeof serial === 'string') : []
      const seriales = [...new Set([...previos, unit.serial])]
      await tx.orderItem.update({
        where: { id: item.id },
        data: { serials: seriales, ...(Number(item.serialsPending) > 0 ? { serialsPending: Math.max(0, Number(item.serialsPending) - 1) } : {}) },
      })
      await syncOrderItemSerials(tx, [{ id: item.id, serials: seriales }])
    }
  }
  const vinculada = await tx.transitAssignment.update({
    where: { id: asignacion.id },
    data: { status: 'VINCULADA', linkedAt: new Date() },
  })
  await tx.auditLog.create({
    data: {
      tenantId,
      userId,
      action: 'TRANSIT_UNIT_LINKED',
      entity: 'TransitAssignment',
      entityId: asignacion.id,
      metadata: {
        serial: unit.serial,
        orderId: asignacion.orderId,
        orderItemId: asignacion.orderItemId,
        customerName: asignacion.customerName,
        sellerId: asignacion.sellerId,
      },
    },
  })
  return vinculada
}

/** Datos de la reserva que deja una asignación al llegar (para la unidad). */
export function reservaDeAsignacion(asignacion: { customerId?: string | null; customerName?: string | null; sellerId: string } | null) {
  if (!asignacion) return { status: 'AVAILABLE' as const, reservationCustomer: null, reservationCustomerId: null, reservedById: null }
  return {
    // Queda reservada a nombre de quien la apartó: no se ofrece a otro vendedor
    // hasta que la venta la use o alguien la libere.
    status: 'RESERVED' as const,
    reservationCustomer: asignacion.customerName || null,
    reservationCustomerId: asignacion.customerId || null,
    reservedById: asignacion.sellerId,
  }
}
