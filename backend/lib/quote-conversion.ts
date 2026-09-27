// Conversión de una cotización en pedido. Una sola implementación para el
// panel (`POST /api/quotes/:id/convert`) y la aprobación pública autenticada
// (A3 · #279), que crea el pedido con la **versión congelada** aprobada.
import type { Prisma } from '@prisma/client'
import { nextOrderNumber } from './order-number'
import type { ItemCongelado } from './quote-approval'

export type PedidoDeCotizacion = {
  tenantId: string
  branchId: string | null
  customerId: string | null
  sellerId: string
  items: ItemCongelado[]
  subtotalPyg: number
  discountPyg: number
  totalPyg: number
  notas: string | null
}

/** Crea el pedido pendiente con los ítems y totales recibidos (sin stock). */
export async function crearPedidoDeCotizacion(tx: Prisma.TransactionClient, pedido: PedidoDeCotizacion) {
  return tx.order.create({
    data: {
      tenantId: pedido.tenantId,
      branchId: pedido.branchId,
      customerId: pedido.customerId,
      sellerId: pedido.sellerId,
      orderNumber: await nextOrderNumber(tx, pedido.tenantId),
      subtotalPyg: pedido.subtotalPyg,
      discountPyg: pedido.discountPyg,
      totalPyg: pedido.totalPyg,
      notes: pedido.notas,
      status: 'PENDING',
      items: {
        create: pedido.items.map((item) => ({
          productId: item.productId,
          description: item.description,
          quantity: item.quantity,
          unitPricePyg: item.unitPricePyg,
          totalPyg: item.totalPyg,
        })),
      },
    },
    include: { items: true },
  })
}
