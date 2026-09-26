import type { Prisma } from '@prisma/client'

// Abastecimiento F1 (#254, dominio clientes): el vínculo entre una venta que
// quedó pendiente de stock/unidades y su necesidad de compra. La necesidad NO
// crea stock (eso pasa recién en la recepción) y conserva el pedido, la línea y
// el cliente originales. Las reglas viven acá, puras y testeables; el armado
// de la fila + auditoría se hace en la transacción del checkout.
//
// Fuentes de esta pasada:
// - SALE_NO_STOCK: producto sin unidades serializadas vendido «sobre pedido».
// - QUANTITY_OVER_STOCK: faltan unidades/IMEI de un producto serializado (el
//   cliente reserva y el IMEI se completa al entregar).
// La reserva de una unidad ya existente NO genera compra (la unidad está);
// `necesidadDeReservaFaltante` queda lista para el flujo de reserva parcial.

export type FuenteDemanda = 'SALE_NO_STOCK' | 'QUANTITY_OVER_STOCK' | 'RESERVATION_NO_STOCK'

export type LineaDemandaVenta = {
  id: string
  productId: string | null
  stockPending?: number | null
  serialsPending?: number | null
}

export type NecesidadDemanda = {
  productId: string
  quantity: number
  source: FuenteDemanda
  dedupeKey: string
  orderItemId: string
}

const positivo = (valor: unknown) => (Number.isFinite(Number(valor)) && Number(valor) > 0 ? Math.round(Number(valor)) : 0)

/**
 * Demanda que deja una venta: una necesidad por línea pendiente, con la fuente
 * según cómo quedó el faltante. La clave de deduplicación usa la línea, así que
 * reintentar la misma venta no duplica la fila (índice único del modelo).
 */
export function necesidadesDeVenta(lineas: LineaDemandaVenta[] = []): NecesidadDemanda[] {
  const necesidades: NecesidadDemanda[] = []
  for (const linea of lineas || []) {
    if (!linea?.productId || !linea?.id) continue
    const sinStock = positivo(linea.stockPending)
    const sobreStock = positivo(linea.serialsPending)
    if (sinStock > 0) {
      necesidades.push({ productId: linea.productId, quantity: sinStock, source: 'SALE_NO_STOCK', dedupeKey: `SALE_NO_STOCK:${linea.id}`, orderItemId: linea.id })
    } else if (sobreStock > 0) {
      necesidades.push({ productId: linea.productId, quantity: sobreStock, source: 'QUANTITY_OVER_STOCK', dedupeKey: `QUANTITY_OVER_STOCK:${linea.id}`, orderItemId: linea.id })
    }
  }
  return necesidades
}

/**
 * Faltante de una reserva: una reserva de unidades existentes no genera compra;
 * si se pide más de lo disponible, la diferencia sí (sin tocar las que están).
 */
export function necesidadDeReservaFaltante({ productId, faltante }: { productId?: string | null; faltante?: number | null }): { productId: string; quantity: number; source: 'RESERVATION_NO_STOCK' } | null {
  const cantidad = positivo(faltante)
  if (!productId || cantidad <= 0) return null
  return { productId, quantity: cantidad, source: 'RESERVATION_NO_STOCK' }
}

/**
 * Datos del cliente en la tarjeta de necesidad: el nombre/contacto se muestran
 * solo a quien puede gestionar clientes (`customers:manage`); el resto ve el id
 * y la tarjeta sabe que hay un cliente detrás (`clienteOculto`).
 */
export function puedeVerCliente(permisos: readonly string[] = []): boolean {
  return permisos.includes('*') || permisos.includes('customers:manage')
}

/**
 * Crea las necesidades de una venta dentro de la transacción del checkout.
 * Tolerante a la deduplicación (P2002): repetir el evento no duplica la fila;
 * cualquier otro error se propaga para no perder demanda en silencio.
 */
export async function crearNecesidadesDeVenta(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string
    branchId?: string | null
    orderId: string
    orderNumber?: string | null
    customerId?: string | null
    createdById: string
    lineas: LineaDemandaVenta[]
  },
): Promise<number> {
  const necesidades = necesidadesDeVenta(input.lineas)
  let creadas = 0
  for (const necesidad of necesidades) {
    try {
      const fila = await tx.supplyNeed.create({
        data: {
          tenantId: input.tenantId,
          branchId: input.branchId || null,
          productId: necesidad.productId,
          quantity: necesidad.quantity,
          source: necesidad.source,
          status: 'ABIERTA',
          orderId: input.orderId,
          orderItemId: necesidad.orderItemId,
          customerId: input.customerId || null,
          dedupeKey: necesidad.dedupeKey,
          createdById: input.createdById,
        },
        select: { id: true },
      })
      creadas += 1
      await tx.auditLog.create({
        data: {
          tenantId: input.tenantId,
          userId: input.createdById,
          action: 'SUPPLY_NEED_CREATED',
          entity: 'SupplyNeed',
          entityId: fila.id,
          metadata: { productId: necesidad.productId, quantity: necesidad.quantity, source: necesidad.source, orderId: input.orderId, orderNumber: input.orderNumber || null, orderItemId: necesidad.orderItemId, automatico: true },
        },
      })
    } catch (error) {
      if ((error as { code?: string })?.code === 'P2002') continue
      throw error
    }
  }
  return creadas
}
