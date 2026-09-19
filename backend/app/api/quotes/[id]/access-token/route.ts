import { randomBytes } from 'node:crypto'
import { prisma } from '../../../../../lib/prisma'
import { error, json } from '../../../../../lib/http'
import { requireSession } from '../../../../../lib/auth'

const nuevoToken = () => randomBytes(24).toString('base64url')
const text = (value: unknown, max = 128) => typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : ''

// Enlace/QR del cliente para la cotización. Devuelve el token vigente (lo crea
// si falta); con regenerate=true lo rota: el enlace anterior deja de funcionar.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  const tenant = session.user.tenantId
  const { id } = await context.params
  const quote = await prisma.quote.findFirst({ where: { id: text(id), tenantId: tenant }, select: { id: true, sellerId: true, branchId: true, publicToken: true } })
  if (!quote) return error('Cotización no encontrada.', 404)
  if (session.user.role === 'VENDEDOR' && quote.sellerId !== session.user.id && quote.branchId !== session.user.branchId) return error('No autorizado.', 403)

  let regenerate = false
  try {
    const raw = await request.text()
    if (raw) regenerate = JSON.parse(raw)?.regenerate === true
  } catch {
    return error('JSON inválido.')
  }

  if (quote.publicToken && !regenerate) return json({ token: quote.publicToken, regenerated: false })

  const token = nuevoToken()
  await prisma.$transaction(async tx => {
    await tx.quote.update({ where: { id: quote.id }, data: { publicToken: token } })
    await tx.auditLog.create({ data: {
      tenantId: tenant,
      userId: session.user.id,
      action: quote.publicToken ? 'QUOTE_PUBLIC_TOKEN_REGENERATED' : 'QUOTE_PUBLIC_TOKEN_CREATED',
      entity: 'Quote',
      entityId: quote.id,
      metadata: { regenerated: Boolean(quote.publicToken) },
    } })
  })
  return json({ token, regenerated: Boolean(quote.publicToken) })
}
