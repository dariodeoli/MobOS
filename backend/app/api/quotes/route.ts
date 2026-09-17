import { prisma } from '../../../lib/prisma'
import { error, json, tenantId } from '../../../lib/http'
import { requireSession } from '../../../lib/auth'
import { quoteTotals } from '../../../lib/pricing'
import { enforceRateLimit } from '../../../lib/rate-limit'
import { esNumeroCotizacionDuplicado, nextQuoteNumber } from '../../../lib/quote-number'

const INT_MAX = 2147483647
const STATUSES = ['DRAFT', 'SENT', 'ACCEPTED', 'CONVERTED', 'EXPIRED', 'CANCELLED']
const safeInt = (value: unknown, min = 0) => Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= INT_MAX
const text = (value: unknown, max = 300) => typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null

type QuoteItem = { productId?: string; description: string; quantity: number; unitPricePyg: number; totalPyg: number }

function normalizeItems(raw: unknown): QuoteItem[] {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 100) throw new Error('La cotización necesita entre 1 y 100 ítems.')
  return raw.map(row => {
    const item = row && typeof row === 'object' ? row as Record<string, unknown> : {}
    const quantity = Number(item.quantity)
    const price = Number(item.unitPricePyg)
    const description = text(item.description, 300) || 'Producto'
    if (!safeInt(quantity, 1) || !safeInt(price)) throw new Error('Cantidad y precio deben ser enteros válidos.')
    const total = quantity * price
    if (!safeInt(total)) throw new Error('El total de una línea excede el rango permitido.')
    return { ...(typeof item.productId === 'string' && item.productId ? { productId: item.productId } : {}), description, quantity, unitPricePyg: price, totalPyg: total }
  })
}

function scopeWhere(session: { user: { id: string; role: string; branchId: string | null } }, tenant: string) {
  if (session.user.role === 'VENDEDOR') return { tenantId: tenant, sellerId: session.user.id }
  if (session.user.role === 'CAJERA') return { tenantId: tenant, branchId: session.user.branchId }
  if (session.user.role === 'GERENTE' && session.user.branchId) return { tenantId: tenant, branchId: session.user.branchId }
  return { tenantId: tenant }
}

// Cotizaciones: vencidas se marcan al listar para que el estado sea confiable.
export async function GET(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  await prisma.quote.updateMany({ where: { tenantId: tenant, status: { in: ['DRAFT', 'SENT', 'ACCEPTED'] }, validUntil: { lt: new Date() } }, data: { status: 'EXPIRED' } })
  const status = new URL(request.url).searchParams.get('status')
  const quotes = await prisma.quote.findMany({
    where: { ...scopeWhere(session, tenant), ...(status && STATUSES.includes(status) ? { status: status as never } : {}) },
    include: { seller: { select: { id: true, name: true } }, customer: { select: { id: true, name: true, phone: true } }, order: { select: { id: true, orderNumber: true } } },
    orderBy: { createdAt: 'desc' },
    take: Math.min(500, Math.max(1, Number(new URL(request.url).searchParams.get('limit')) || 200)),
    ...(new URL(request.url).searchParams.get('cursor') ? { cursor: { id: String(new URL(request.url).searchParams.get('cursor')) }, skip: 1 } : {}),
  })
  return json(quotes)
}

export async function POST(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  const limited = enforceRateLimit(request, 'quotes', 60, 60_000)
  if (limited) return limited
  let body: any; try { body = await request.json() } catch { return error('JSON inválido.') }
  const customerName = text(body?.customerName, 200)
  if (!customerName) return error('El nombre del cliente es obligatorio.')
  const validUntil = body?.validUntil ? new Date(body.validUntil) : null
  if (validUntil && Number.isNaN(validUntil.getTime())) return error('Vencimiento inválido.')
  try {
    const items = normalizeItems(body?.items)
    const totals = quoteTotals(items.map(item => ({ quantity: item.quantity, unitPricePyg: item.unitPricePyg })), Number(body?.discountPyg ?? 0))
    const subtotal = totals.subtotalPyg
    const discount = totals.discountPyg
    const customerId = typeof body?.customerId === 'string' && body.customerId ? body.customerId : null
    if (customerId && !await prisma.customer.findFirst({ where: { id: customerId, tenantId: tenant }, select: { id: true } })) return error('Cliente no encontrado.', 404)
    // El número se calcula dentro de la transacción; si otra cotización ganó
    // el número en el medio, el índice único rechaza y se reintenta.
    const quote = await (async () => {
      for (let intento = 0; ; intento++) {
        try {
          return await prisma.$transaction(async tx => tx.quote.create({ data: {
            tenantId: tenant, branchId: session.user.branchId, customerId, customerName, sellerId: session.user.id, number: await nextQuoteNumber(tx, tenant),
            items, subtotalPyg: subtotal, discountPyg: discount, totalPyg: totals.totalPyg,
            notes: text(body?.notes, 2000), validUntil, status: 'DRAFT',
          }, include: { seller: { select: { id: true, name: true } }, customer: { select: { id: true, name: true, phone: true } } } }))
        } catch (e) {
          if (intento >= 2 || !esNumeroCotizacionDuplicado(e)) throw e
        }
      }
    })()
    const number = quote.number
    await prisma.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'QUOTE_CREATED', entity: 'Quote', entityId: quote.id, metadata: { number, totalPyg: quote.totalPyg } } })
    return json(quote, { status: 201 })
  } catch (cause) { return error(cause instanceof Error ? cause.message : 'No se pudo crear la cotización.', 400) }
}

export async function PATCH(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  let body: any; try { body = await request.json() } catch { return error('JSON inválido.') }
  const id = text(body?.id, 128)
  if (!id) return error('Cotización obligatoria.')
  const quote = await prisma.quote.findFirst({ where: { id, tenantId: tenant } })
  if (!quote) return error('Cotización no encontrada.', 404)
  if (session.user.role === 'VENDEDOR' && quote.sellerId !== session.user.id && quote.branchId !== session.user.branchId) return error('No autorizado.', 403)
  const status = body?.status === undefined ? undefined : (STATUSES.includes(body.status) ? body.status : null)
  if (status === null) return error('Estado de cotización inválido.')
  if (status && ['CONVERTED', 'EXPIRED'].includes(status) && status !== quote.status) return error('Ese estado se gestiona al convertir o vencer la cotización.', 409)
  try {
    const validUntil = body?.validUntil === undefined ? undefined : body.validUntil === null || body.validUntil === '' ? null : new Date(body.validUntil)
    if (validUntil && Number.isNaN(validUntil.getTime())) return error('Vencimiento inválido.')
    const updated = await prisma.$transaction(async tx => {
      const data = await tx.quote.update({ where: { id: quote.id }, data: {
        ...(status ? { status } : {}),
        ...(validUntil !== undefined ? { validUntil } : {}),
        ...(body?.notes !== undefined ? { notes: text(body.notes, 2000) } : {}),
        ...(body?.discountPyg !== undefined ? { discountPyg: Number(body.discountPyg), totalPyg: quote.subtotalPyg - Number(body.discountPyg) } : {}),
      }, include: { seller: { select: { id: true, name: true } }, customer: { select: { id: true, name: true, phone: true } }, order: { select: { id: true, orderNumber: true } } } })
      await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'QUOTE_UPDATED', entity: 'Quote', entityId: quote.id, metadata: { from: quote.status, to: data.status } } })
      return data
    })
    return json(updated)
  } catch (cause) { return error(cause instanceof Error ? cause.message : 'No se pudo actualizar la cotización.', 409) }
}
