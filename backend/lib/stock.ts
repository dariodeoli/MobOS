import { Prisma } from '@prisma/client'

// Punto único para mover el contador agregado de stock. Centralizarlo evita
// que cada ruta repita guardas distintas y derive en diferencias difíciles de
// auditar; el stock real vive en las unidades (IMEI), este contador es la
// vista rápida que se mantiene consistente en cada operación.
export type StockTx = Prisma.TransactionClient

const INT_MAX = 2147483647

export async function changeStock(tx: StockTx, input: {
  tenantId: string
  productId: string
  delta: number
  branchId?: string | null
  includeBranchless?: boolean
  isActive?: boolean
  message?: string
}) {
  const { tenantId, productId, delta } = input
  if (delta === 0) return
  const where: Prisma.ProductWhereInput = { id: productId, tenantId, ...(input.isActive === false ? {} : { isActive: true }) }
  if (input.branchId) where.OR = [{ branchId: input.branchId }, ...(input.includeBranchless ? [{ branchId: null }] : [])]
  if (delta < 0) where.stock = { gte: -delta }
  else where.stock = { lt: INT_MAX - delta + 1 }
  const updated = await tx.product.updateMany({ where, data: { stock: { increment: delta } } })
  if (updated.count !== 1) throw new Error(input.message || (delta < 0 ? 'Stock insuficiente o producto fuera de la sucursal.' : 'No se pudo actualizar el stock.'))
}

// Recalcula el contador desde las unidades físicas (disponibles + reservadas).
// Se usa para reparar diferencias detectadas por la verificación de consistencia.
export async function recomputeStock(tx: StockTx, tenantId: string, productId: string) {
  const units = await tx.inventoryUnit.count({ where: { tenantId, productId, status: { in: ['AVAILABLE', 'RESERVED'] } } })
  const product = await tx.product.updateMany({ where: { id: productId, tenantId }, data: { stock: units } })
  if (product.count !== 1) throw new Error('No se pudo recalcular el stock.')
  return units
}
