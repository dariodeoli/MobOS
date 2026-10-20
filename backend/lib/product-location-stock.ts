import { Prisma } from '@prisma/client'

type Tx = Prisma.TransactionClient

export type LocationStockInput = {
  tenantId: string
  productId: string
  locationId: string
  quantity: number
}

function validQuantity(quantity: number) {
  if (!Number.isSafeInteger(quantity) || quantity < 0) throw new Error('La cantidad por ubicación debe ser un entero no negativo.')
}

/**
 * Legacy writers do not know which physical location changed. Once a product
 * has an explicit location balance, silently changing only Product.stock would
 * make the branch total disagree with its locations. Callers that still lack
 * a location must fail closed until they are migrated to the location-aware
 * service.
 */
export async function assertLegacyStockMutationAllowed(tx: Tx, tenantId: string, productId: string) {
  const assigned = await tx.productLocationBalance.count({ where: { tenantId, productId } })
  if (assigned > 0) throw new Error('Este producto tiene saldo por ubicación; seleccioná una ubicación antes de modificar el stock.')
}

async function lockProduct(tx: Tx, input: Pick<LocationStockInput, 'tenantId' | 'productId' | 'locationId'>) {
  const rows = await tx.$queryRaw<Array<{ id: string; branchId: string | null; stock: number; stockKind: string | null }>>(Prisma.sql`
    SELECT p."id", p."branchId", p."stock", p."stockKind"::text
    FROM "Product" p
    JOIN "StockLocation" l ON l."id" = ${input.locationId}
    WHERE p."id" = ${input.productId}
      AND p."tenantId" = ${input.tenantId}
      AND l."tenantId" = ${input.tenantId}
      AND l."branchId" = p."branchId"
      AND l."isActive" = TRUE
    FOR UPDATE OF p, l
  `)
  const product = rows[0]
  if (!product) throw new Error('Producto o ubicación no pertenece a la empresa y sucursal indicada.')
  if (product.stockKind === 'EQUIPO') throw new Error('Los equipos serializados se gestionan por unidad, no por cantidad.')
  return product
}

async function totalByProduct(tx: Tx, tenantId: string, productId: string) {
  const row = await tx.productLocationBalance.aggregate({
    where: { tenantId, productId },
    _sum: { quantity: true },
  })
  return row._sum.quantity ?? 0
}

/**
 * Asigna stock histórico sin ubicación a un depósito explícito. La operación
 * no inventa stock ni modifica Product.stock; consume solo el remanente que
 * todavía no está asignado a otra ubicación y queda protegida por lock.
 */
export async function allocateProductStockToLocation(tx: Tx, input: LocationStockInput) {
  validQuantity(input.quantity)
  const product = await lockProduct(tx, input)
  const assigned = await totalByProduct(tx, input.tenantId, input.productId)
  const unassigned = product.stock - assigned
  if (input.quantity > unassigned) throw new Error('La cantidad supera el stock de la sucursal aún no asignado a una ubicación.')
  const balance = await tx.productLocationBalance.upsert({
    where: { productId_locationId: { productId: input.productId, locationId: input.locationId } },
    create: { tenantId: input.tenantId, productId: input.productId, locationId: input.locationId, quantity: input.quantity },
    update: { quantity: { increment: input.quantity } },
  })
  return { balance, assignedBefore: assigned, assignedAfter: assigned + input.quantity, unassignedAfter: unassigned - input.quantity }
}

/**
 * Cambia el saldo de una ubicación y el agregado de la sucursal en la misma
 * transacción. Todos los escritores que conozcan el depósito deben usar este
 * camino; un escritor legacy sin locationId debe permanecer en Product.stock.
 */
export async function changeProductLocationStock(tx: Tx, input: LocationStockInput & { delta: number }) {
  if (!Number.isSafeInteger(input.delta)) throw new Error('El delta por ubicación debe ser un entero seguro.')
  const product = await lockProduct(tx, input)
  const current = await tx.productLocationBalance.findUnique({ where: { productId_locationId: { productId: input.productId, locationId: input.locationId } } })
  const before = current?.quantity ?? 0
  const after = before + input.delta
  if (after < 0) throw new Error('Stock insuficiente en la ubicación.')
  if (product.stock + input.delta < 0) throw new Error('Stock insuficiente en la sucursal.')
  const balance = await tx.productLocationBalance.upsert({
    where: { productId_locationId: { productId: input.productId, locationId: input.locationId } },
    create: { tenantId: input.tenantId, productId: input.productId, locationId: input.locationId, quantity: after },
    update: { quantity: after },
  })
  const aggregate = await tx.product.updateMany({ where: { id: input.productId, tenantId: input.tenantId, stock: product.stock }, data: { stock: { increment: input.delta } } })
  if (aggregate.count !== 1) throw new Error('El stock de la sucursal cambió durante el movimiento.')
  return { balance, before, after, branchStockBefore: product.stock, branchStockAfter: product.stock + input.delta }
}

export async function setProductLocationStock(tx: Tx, input: LocationStockInput) {
  const current = await tx.productLocationBalance.findUnique({ where: { productId_locationId: { productId: input.productId, locationId: input.locationId } }, select: { quantity: true } })
  const delta = input.quantity - (current?.quantity ?? 0)
  return changeProductLocationStock(tx, { ...input, delta })
}

