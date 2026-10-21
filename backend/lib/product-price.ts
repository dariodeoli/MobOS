import { prisma } from './prisma'
import { canAccessAny, type AuthUser } from './auth'
import { LIMITE_MONTO_GENERAL } from './montos'

export class ProductPriceError extends Error { constructor(public code: string) { super(code) } }
export async function updateProductPrice(input: { tenantId: string; user: Pick<AuthUser, 'id' | 'role' | 'branchId' | 'permissions' | 'tenantId'>; productId: string; pricePyg: number; expectedPricePyg?: number; effectiveBranchId?: string | null; includeAudit?: boolean }, db: any = prisma) {
  if (!canAccessAny(input.user as AuthUser, ['products:manage'])) throw new ProductPriceError('permission_denied')
  if (!Number.isSafeInteger(input.pricePyg) || input.pricePyg < 0 || input.pricePyg > LIMITE_MONTO_GENERAL) throw new ProductPriceError('price_invalid')
  const product = await db.product.findFirst({ where: { id: input.productId, tenantId: input.tenantId, isActive: true } })
  if (!product) throw new ProductPriceError('product_not_found')
  const branch = input.user.branchId ?? input.effectiveBranchId ?? null
  if (!branch && product.branchId && input.user.role !== 'ADMIN') throw new ProductPriceError('branch_denied')
  if (branch && product.branchId && branch !== product.branchId) throw new ProductPriceError('branch_denied')
  if (input.expectedPricePyg !== undefined && Number(product.pricePyg) !== input.expectedPricePyg) throw new ProductPriceError('stale_price')
  const run = typeof db.$transaction === 'function' ? (fn: any) => db.$transaction(fn) : (fn: any) => fn(db)
  const updated = await run(async (tx: any) => {
    const current = await tx.product.findFirst({ where: { id: product.id, tenantId: input.tenantId, isActive: true }, select: { pricePyg: true, branchId: true } })
    if (!current || (!branch && current.branchId && input.user.role !== 'ADMIN') || (branch && current.branchId && current.branchId !== branch)) throw new ProductPriceError('branch_denied')
    if (input.expectedPricePyg !== undefined && Number(current.pricePyg) !== input.expectedPricePyg) throw new ProductPriceError('stale_price')
    const claimed = await tx.product.updateMany({ where: { id: product.id, tenantId: input.tenantId, isActive: true, ...(branch ? { OR: [{ branchId: branch }, { branchId: null }] } : {}), ...(input.expectedPricePyg !== undefined ? { pricePyg: input.expectedPricePyg } : {}) }, data: { pricePyg: input.pricePyg } })
    if (claimed.count !== 1) throw new ProductPriceError('stale_price')
    const row = await tx.product.findUniqueOrThrow({ where: { id: product.id } })
    await tx.auditLog.create({ data: { tenantId: input.tenantId, userId: input.user.id, action: 'PRODUCT_PRICE_UPDATED', entity: 'Product', entityId: row.id, metadata: { before: Number(current.pricePyg), after: input.pricePyg, branchId: row.branchId, source: 'shared-price-service' } } })
    return { before: Number(current.pricePyg), after: input.pricePyg, productId: row.id, branchId: row.branchId }
  })
  return input.includeAudit ? updated : await prisma.product.findUniqueOrThrow({ where: { id: input.productId } })
}
