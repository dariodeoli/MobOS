import { prisma } from '../../../../../lib/prisma'
import { error, json } from '../../../../../lib/http'
import { enforceRateLimit } from '../../../../../lib/rate-limit'

// Vista pública de la cotización para el cliente: número, empresa/sucursal,
// ítems con precios, descuento, total, validez y estado. Nunca expone costos,
// márgenes, notas internas ni datos de otras cotizaciones.
const ABORTABLES: readonly string[] = ['DRAFT', 'SENT']

const text = (value: unknown, max = 300) => typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : ''

async function porToken(token: string) {
  if (!token || token.length > 200) return null
  return prisma.quote.findUnique({
    where: { publicToken: token },
    include: {
      branch: { select: { name: true, address: true, city: true, department: true, phone: true, instagram: true } },
      customer: { select: { name: true, document: true } },
      seller: { select: { name: true } },
      tenant: { select: { name: true, logos: { select: { id: true }, take: 1 } } },
    },
  })
}

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params
  const quote = await porToken(text(token, 200))
  if (!quote) return error('Cotización no encontrada.', 404)

  // Vencida se marca al consultar, igual que el listado interno: el estado que
  // ve el cliente es siempre confiable.
  let status = quote.status
  if (ABORTABLES.includes(status) && quote.validUntil && quote.validUntil.getTime() < Date.now()) {
    await prisma.quote.updateMany({ where: { id: quote.id, status: { in: ['DRAFT', 'SENT'] } }, data: { status: 'EXPIRED' } })
    status = 'EXPIRED'
  }

  const resolucion = await prisma.auditLog.findFirst({
    where: { tenantId: quote.tenantId, entity: 'Quote', entityId: quote.id, action: { in: ['QUOTE_ACCEPTED', 'QUOTE_REJECTED'] } },
    select: { action: true, metadata: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  })
  const metadata = resolucion?.metadata && typeof resolucion.metadata === 'object' ? resolucion.metadata as Record<string, unknown> : null

  const items = Array.isArray(quote.items) ? quote.items as Array<Record<string, unknown>> : []
  return json({
    number: quote.number,
    status,
    createdAt: quote.createdAt,
    updatedAt: quote.updatedAt,
    validUntil: quote.validUntil,
    company: { name: quote.tenant?.name || null, logo: Boolean(quote.tenant?.logos?.length) },
    branch: quote.branch ? {
      name: quote.branch.name,
      address: quote.branch.address,
      city: quote.branch.city,
      department: quote.branch.department,
      phone: quote.branch.phone,
      instagram: quote.branch.instagram,
    } : null,
    customerName: quote.customerName,
    customer: quote.customer ? { name: quote.customer.name, document: quote.customer.document } : null,
    seller: quote.seller?.name || null,
    items: items.map(item => ({
      description: typeof item.description === 'string' && item.description ? item.description : 'Producto',
      quantity: Number(item.quantity) || 1,
      unitPricePyg: Number(item.unitPricePyg) || 0,
      totalPyg: Number(item.totalPyg) || 0,
    })),
    subtotalPyg: quote.subtotalPyg,
    discountPyg: quote.discountPyg,
    totalPyg: quote.totalPyg,
    notes: quote.notes,
    resolution: resolucion ? {
      status: resolucion.action === 'QUOTE_ACCEPTED' ? 'ACCEPTED' : 'REJECTED',
      at: resolucion.createdAt,
      note: metadata && typeof metadata.note === 'string' ? metadata.note : null,
    } : null,
  })
}

// El cliente resuelve la cotización con un toque: aceptar o rechazar (con
// motivo opcional). Solo una vez y solo si sigue abierta y vigente.
export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const limited = enforceRateLimit(request, 'quotes-public', 30, 60_000)
  if (limited) return limited
  const { token } = await context.params
  let body: { action?: unknown; note?: unknown }
  try { body = await request.json() } catch { return error('JSON inválido.') }
  const action = body?.action
  if (action !== 'accept' && action !== 'reject') return error('Acción inválida.')
  const note = text(body?.note, 500)
  if (body?.note !== undefined && body?.note !== null && body?.note !== '' && !note) return error('El motivo no puede superar 500 caracteres.')
  const status = action === 'accept' ? 'ACCEPTED' : 'REJECTED'
  const auditAction = action === 'accept' ? 'QUOTE_ACCEPTED' : 'QUOTE_REJECTED'

  const quote = await prisma.quote.findUnique({ where: { publicToken: text(token, 200) }, select: { id: true, tenantId: true, status: true, validUntil: true } })
  if (!quote) return error('Cotización no encontrada.', 404)

  try {
    const resuelto = await prisma.$transaction(async tx => {
      const current = await tx.quote.findUnique({ where: { id: quote.id }, select: { status: true, validUntil: true } })
      if (!current || !ABORTABLES.includes(current.status)) throw new Error('Esta cotización ya fue resuelta.')
      if (current.validUntil && current.validUntil.getTime() < Date.now()) {
        await tx.quote.updateMany({ where: { id: quote.id, status: { in: ['DRAFT', 'SENT'] } }, data: { status: 'EXPIRED' } })
        throw new Error('Esta cotización venció. Pedile al vendedor una nueva.')
      }
      const claim = await tx.quote.updateMany({ where: { id: quote.id, status: { in: ['DRAFT', 'SENT'] } }, data: { status } })
      if (claim.count !== 1) throw new Error('Esta cotización ya fue resuelta.')
      await tx.auditLog.create({ data: {
        tenantId: quote.tenantId,
        userId: null,
        action: auditAction,
        entity: 'Quote',
        entityId: quote.id,
        metadata: { origin: 'public', status, note: note || null },
      } })
      return { status, at: new Date() }
    })
    return json(resuelto)
  } catch (cause) {
    return error(cause instanceof Error ? cause.message : 'No se pudo resolver la cotización.', 409)
  }
}
