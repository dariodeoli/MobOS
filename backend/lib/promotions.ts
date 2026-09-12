import { Prisma } from '@prisma/client'
import { InputError, objectInput, textInput } from './payment-input'

export function couponCode(value: unknown) {
  const code = textInput(value, 'Cupón', 40).toUpperCase()
  if (!/^[A-Z0-9_-]{2,40}$/.test(code)) throw new InputError('Código de cupón inválido.')
  return code
}
export function promotionInput(payload: unknown) {
  const b = objectInput(payload)
  if (Object.keys(b).some(k => !['code','name','kind','value','productId','startsAt','endsAt','maxUnits'].includes(k))) throw new InputError('Campo de promoción no admitido.')
  if (!['PERCENT', 'FIXED'].includes(b.kind as string) || !Number.isSafeInteger(b.value) || Number(b.value) <= 0 || Number(b.value) > (b.kind === 'PERCENT' ? 100 : 2147483647)) throw new InputError('Descuento inválido.')
  const startsAt = new Date(typeof b.startsAt === 'string' ? b.startsAt : '')
  const endsAt = new Date(typeof b.endsAt === 'string' ? b.endsAt : '')
  if (!Number.isFinite(+startsAt) || !Number.isFinite(+endsAt) || endsAt <= startsAt) throw new InputError('Vigencia inválida.')
  if (b.maxUnits != null && (!Number.isSafeInteger(b.maxUnits) || Number(b.maxUnits) < 1 || Number(b.maxUnits) > 2147483647)) throw new InputError('Límite de unidades inválido.')
  return { code: couponCode(b.code), name: textInput(b.name, 'Nombre', 120), kind: b.kind as string, value: b.value as number, startsAt, endsAt, maxUnits: b.maxUnits == null ? null : b.maxUnits as number, productId: b.productId == null ? null : textInput(b.productId, 'Producto', 200) }
}

// Call inside the order transaction. The row lock serializes redemptions and deactivation.
export async function quotePromotion(tx: Prisma.TransactionClient, tenantId: string, branchId: string | null, input: unknown, consume = false) {
  const b = objectInput(input)
  const code = couponCode(b.couponCode)
  const productId = textInput(b.productId, 'Producto', 200)
  const quantity = b.quantity ?? 1
  if (!Number.isSafeInteger(quantity) || Number(quantity) < 1 || Number(quantity) > 2147483647) throw new InputError('Cantidad inválida.')
  await tx.$queryRaw`SELECT "id" FROM "Promotion" WHERE "tenantId" = ${tenantId} AND "code" = ${code} FOR UPDATE`
  const promotion = await tx.promotion.findUnique({ where: { tenantId_code: { tenantId, code } } })
  const now = new Date()
  if (!promotion || !promotion.isActive || promotion.startsAt > now || promotion.endsAt <= now) throw new InputError('Cupón inexistente, inactivo o fuera de vigencia.', 409)
  const product = await tx.product.findFirst({ where: { id: productId, tenantId, isActive: true, OR: [{ branchId }, { branchId: null }] } })
  if (!product || (promotion.productId && promotion.productId !== product.id)) throw new InputError('Cupón no aplicable al producto.', 409)
  if (promotion.maxUnits !== null && promotion.usedUnits + Number(quantity) > promotion.maxUnits) throw new InputError('Límite de unidades del cupón agotado.', 409)
  const discount = Math.min(product.pricePyg, promotion.kind === 'PERCENT' ? Math.round(product.pricePyg * promotion.value / 100) : promotion.value)
  const unitPricePyg = product.pricePyg - discount
  if (consume) await tx.promotion.update({ where: { id: promotion.id }, data: { usedUnits: { increment: Number(quantity) } } })
  return { couponCode: code, unitPricePyg, promotionSnapshot: { id: promotion.id, code, name: promotion.name, kind: promotion.kind, value: promotion.value, baseUnitPricePyg: product.pricePyg, discountUnitPyg: discount } }
}
