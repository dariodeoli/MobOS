import { prisma } from '../../../lib/prisma'
import { error, json } from '../../../lib/http'
import { requireSession } from '../../../lib/auth'
import { InputError, objectInput, textInput } from '../../../lib/payment-input'

// Escalones de precio por cantidad de un producto: desde N unidades el precio
// unitario de la línea es el del escalón (gana sobre listas, mayorista y
// minorista). Se reemplazan todos los escalones del producto de una vez, de
// forma atómica, y cada cambio queda auditado.
const INT_MAX = 2147483647
const MAX_ESCALONES = 20
const esGestor = (rol: string) => ['ADMIN', 'GERENTE'].includes(rol)

type Escalon = { minQuantity: number; unitPricePyg: number }

function normalizarEscalones(raw: unknown): Escalon[] {
  if (raw === undefined) return []
  if (!Array.isArray(raw)) throw new InputError('Los escalones deben ser una lista.')
  if (raw.length > MAX_ESCALONES) throw new InputError(`Cada producto admite hasta ${MAX_ESCALONES} escalones.`)
  const escalones: Escalon[] = []
  const cantidades = new Set<number>()
  for (const fila of raw) {
    const item = objectInput(fila)
    const minQuantity = Number(item.minQuantity)
    const unitPricePyg = Number(item.unitPricePyg)
    if (!Number.isSafeInteger(minQuantity) || minQuantity < 2 || minQuantity > 1000000) throw new InputError('Cada escalón empieza en 2 unidades o más.')
    if (!Number.isSafeInteger(unitPricePyg) || unitPricePyg < 0 || unitPricePyg > INT_MAX) throw new InputError('El precio del escalón debe ser un entero válido.')
    if (cantidades.has(minQuantity)) throw new InputError('Hay dos escalones con la misma cantidad mínima.')
    cantidades.add(minQuantity)
    escalones.push({ minQuantity, unitPricePyg })
  }
  return escalones.sort((a, b) => a.minQuantity - b.minQuantity)
}

export async function GET(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  const productId = (new URL(request.url).searchParams.get('productId') || '').trim().slice(0, 128)
  const escalones = await prisma.priceTier.findMany({
    where: { tenantId: session.user.tenantId, ...(productId ? { productId } : {}) },
    orderBy: [{ productId: 'asc' }, { minQuantity: 'asc' }],
    take: 2000,
  })
  return json(escalones)
}

export async function POST(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!esGestor(session.user.role)) return error('Solo administración o gerencia configuran precios por cantidad.', 403)
  try {
    const body = objectInput(await request.json())
    const productId = textInput(body.productId, 'Producto', 128)
    const producto = await prisma.product.findFirst({ where: { id: productId, tenantId: session.user.tenantId }, select: { id: true } })
    if (!producto) return error('Producto no encontrado.', 404)
    const escalones = normalizarEscalones(body.tiers)
    const resultado = await prisma.$transaction(async (tx) => {
      const anteriores = await tx.priceTier.findMany({ where: { tenantId: session.user.tenantId, productId }, orderBy: { minQuantity: 'asc' }, select: { minQuantity: true, unitPricePyg: true } })
      await tx.priceTier.deleteMany({ where: { tenantId: session.user.tenantId, productId } })
      if (escalones.length) await tx.priceTier.createMany({ data: escalones.map((escalon) => ({ ...escalon, tenantId: session.user.tenantId, productId })) })
      await tx.auditLog.create({
        data: {
          tenantId: session.user.tenantId,
          userId: session.user.id,
          action: 'PRICE_TIERS_UPDATED',
          entity: 'Product',
          entityId: productId,
          metadata: { escalones: { from: anteriores.map((e) => `${e.minQuantity}+ → ${e.unitPricePyg}`).join(', '), to: escalones.map((e) => `${e.minQuantity}+ → ${e.unitPricePyg}`).join(', ') } },
        },
      })
      return escalones
    })
    return json({ productId, tiers: resultado })
  } catch (cause) {
    return error(cause instanceof InputError ? cause.message : 'No se pudieron guardar los escalones.', cause instanceof InputError ? cause.status : 400)
  }
}
