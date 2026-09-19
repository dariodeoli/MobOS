import { Prisma } from '@prisma/client'
import { prisma } from '../../../lib/prisma'
import { error, json, tenantId } from '../../../lib/http'
import { requireSession } from '../../../lib/auth'
import { quoteTotals } from '../../../lib/pricing'
import { enforceRateLimit } from '../../../lib/rate-limit'
import { esNumeroCotizacionDuplicado, nextQuoteNumber } from '../../../lib/quote-number'

const INT_MAX = 2147483647
const STATUSES = ['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'CONVERTED', 'EXPIRED', 'CANCELLED']
const safeInt = (value: unknown, min = 0) => Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= INT_MAX
const text = (value: unknown, max = 300) => typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null

// Patrón LIKE literal: % y _ del texto buscado no actúan como comodines.
const patronLike = (valor: string) => `%${valor.replace(/[\\%_]/g, '\\$&')}%`

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

// Cotizaciones: vencidas se marcan al listar para que el estado sea confiable.
// El listado usa el mismo patrón que Pedidos: búsqueda y estado se resuelven en
// el servidor sobre todo el alcance del usuario, con paginación por cursor.
export async function GET(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  await prisma.quote.updateMany({ where: { tenantId: tenant, status: { in: ['DRAFT', 'SENT', 'ACCEPTED'] }, validUntil: { lt: new Date() } }, data: { status: 'EXPIRED' } })
  const params = new URL(request.url).searchParams
  const status = params.get('status')
  const q = (params.get('q') || '').trim().slice(0, 120)
  const limit = Math.min(200, Math.max(1, Number(params.get('limit')) || 50))
  const cursor = params.get('cursor')
  // Alcance por rol, espejo de scopeWhere: VENDEDOR lo suyo; CAJERA su sucursal;
  // GERENTE con sucursal la suya; ADMIN/GERENTE sin sucursal todo el tenant.
  const condiciones: Prisma.Sql[] = [Prisma.sql`q."tenantId" = ${tenant}`]
  if (status === 'abiertas') condiciones.push(Prisma.sql`q."status"::text IN ('DRAFT', 'SENT', 'ACCEPTED')`)
  else if (status && STATUSES.includes(status)) condiciones.push(Prisma.sql`q."status"::text = ${status}`)
  if (session.user.role === 'VENDEDOR') condiciones.push(Prisma.sql`q."sellerId" = ${session.user.id}`)
  else if (session.user.role === 'CAJERA') condiciones.push(session.user.branchId ? Prisma.sql`q."branchId" = ${session.user.branchId}` : Prisma.sql`q."branchId" IS NULL`)
  else if (session.user.role === 'GERENTE' && session.user.branchId) condiciones.push(Prisma.sql`q."branchId" = ${session.user.branchId}`)
  if (cursor) {
    const cursorRow = await prisma.quote.findFirst({ where: { id: cursor, tenantId: tenant }, select: { createdAt: true } })
    if (!cursorRow) return json([])
    condiciones.push(Prisma.sql`(q."createdAt" < ${cursorRow.createdAt} OR (q."createdAt" = ${cursorRow.createdAt} AND q."id" < ${cursor}))`)
  }
  if (q) {
    // Búsqueda: número de cotización, nombre del cliente y descripción de ítems.
    const texto = patronLike(q)
    condiciones.push(Prisma.sql`(
      q."number" ILIKE ${texto}
      OR q."customerName" ILIKE ${texto}
      OR q."items"::text ILIKE ${texto}
      OR EXISTS (SELECT 1 FROM "Customer" c WHERE c."id" = q."customerId" AND c."name" ILIKE ${texto})
    )`)
  }
  const ids = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT q."id"
    FROM "Quote" q
    WHERE ${Prisma.join(condiciones, ' AND ')}
    ORDER BY q."createdAt" DESC, q."id" DESC
    LIMIT ${limit}
  `)
  if (!ids.length) return json([])
  // Segunda consulta con el include de siempre; el orden lo fija la lista de
  // ids para conservar la paginación por cursor.
  const quotes = await prisma.quote.findMany({
    where: { id: { in: ids.map((row) => row.id) } },
    include: { seller: { select: { id: true, name: true } }, customer: { select: { id: true, name: true, phone: true } }, order: { select: { id: true, orderNumber: true } } },
  })
  const porId = new Map(quotes.map((quote) => [quote.id, quote]))
  return json(ids.flatMap((row) => { const quote = porId.get(row.id); return quote ? [quote] : [] }))
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
