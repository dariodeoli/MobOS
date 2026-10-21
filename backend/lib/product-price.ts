import { prisma } from './prisma'
import { canAccessAny, type AuthUser } from './auth'
import { LIMITE_MONTO_GENERAL } from './montos'

export class ProductPriceError extends Error { constructor(public code: string) { super(code) } }
export async function updateProductPrice(input: { tenantId: string; user: Pick<AuthUser, 'id' | 'role' | 'branchId' | 'permissions' | 'tenantId'>; productId: string; pricePyg: number; expectedPricePyg?: number }, db: any = prisma) {
  if (!canAccessAny(input.user as AuthUser, ['products:manage'])) throw new ProductPriceError('permission_denied')
  if (!Number.isSafeInteger(input.pricePyg) || input.pricePyg < 0 || input.pricePyg > LIMITE_MONTO_GENERAL) throw new ProductPriceError('price_invalid')
  const product = await db.product.findFirst({ where: { id: input.productId, tenantId: input.tenantId, isActive: true } })
  if (!product) throw new ProductPriceError('product_not_found')
  if (input.user.branchId && product.branchId && input.user.branchId !== product.branchId) throw new ProductPriceError('branch_denied')
  if (input.expectedPricePyg !== undefined && Number(product.pricePyg) !== input.expectedPricePyg) throw new ProductPriceError('stale_price')
  const run = typeof db.$transaction === 'function' ? (fn: any) => db.$transaction(fn) : (fn: any) => fn(db)
  const updated = await run(async (tx: any) => {
    const current = await tx.product.findFirst({ where: { id: product.id, tenantId: input.tenantId, isActive: true }, select: { pricePyg: true, branchId: true } })
    if (!current || (input.user.branchId && current.branchId && current.branchId !== input.user.branchId)) throw new ProductPriceError('branch_denied')
    if (input.expectedPricePyg !== undefined && Number(current.pricePyg) !== input.expectedPricePyg) throw new ProductPriceError('stale_price')
    const row = await tx.product.update({ where: { id: product.id }, data: { pricePyg: input.pricePyg } })
    await tx.auditLog.create({ data: { tenantId: input.tenantId, userId: input.user.id, action: 'PRODUCT_PRICE_UPDATED', entity: 'Product', entityId: row.id, metadata: { before: Number(current.pricePyg), after: input.pricePyg, branchId: row.branchId, source: 'shared-price-service' } } })
    return { before: Number(current.pricePyg), after: input.pricePyg, productId: row.id, branchId: row.branchId }
  })
  return updated
}
