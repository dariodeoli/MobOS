import { prisma } from '../../../../../lib/prisma'
import { error, json } from '../../../../../lib/http'
import { requireSession } from '../../../../../lib/auth'
import { hashTokenPublico, nuevoTokenPublico } from '../../../../../lib/public-token'

// Enlace/QR del portal del cliente (resumen de cuenta). Un token vigente por
// nivel: Rápido (saldo, vencimientos y últimos pedidos) o Completo (además
// garantías, direcciones y enlaces a los comprobantes). Al regenerar se revoca
// el token anterior y queda auditoría con el usuario que lo hizo.
const LEVELS = ['rapido', 'completo'] as const
const canManage = (role: string) => ['ADMIN', 'GERENTE', 'VENDEDOR'].includes(role)

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!canManage(session.user.role)) return error('No autorizado.', 403)
  const tenant = session.user.tenantId
  const { id } = await context.params
  const customerId = (id || '').trim().slice(0, 128)
  if (!customerId) return error('Cliente obligatorio.')

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, tenantId: tenant },
    select: { id: true },
  })
  if (!customer) return error('Cliente no encontrado.', 404)

  let level = ''
  let regenerate = false
  try {
    const raw = await request.text()
    if (raw) {
      const body = JSON.parse(raw)
      level = typeof body?.level === 'string' ? body.level : ''
      regenerate = body?.regenerate === true
    }
  } catch {
    return error('JSON inválido.')
  }
  if (!LEVELS.includes(level as (typeof LEVELS)[number])) return error('Nivel de portal inválido.')

  const vigente = await prisma.customerPortalToken.findFirst({
    where: { customerId: customer.id, level, revokedAt: null },
    select: { id: true, token: true },
    orderBy: { createdAt: 'desc' },
  })
  // El token vigente no se vuelve a mostrar (#172/#178): si es legacy (en
  // claro) se devuelve igual que antes; si ya está hasheado, la ficha avisa
  // que hay un enlace activo y ofrece regenerarlo.
  if (vigente && !regenerate) return json({ level, token: vigente.token ?? null, reused: true, regenerated: false })

  const tokenEnClaro = nuevoTokenPublico()
  const creado = await prisma.$transaction(async tx => {
    if (vigente) {
      await tx.customerPortalToken.update({ where: { id: vigente.id }, data: { revokedAt: new Date() } })
    }
    const token = await tx.customerPortalToken.create({
      data: {
        tenantId: tenant,
        customerId: customer.id,
        level,
        token: null,
        tokenHash: hashTokenPublico(tokenEnClaro),
        createdBy: session.user.id,
      },
      select: { level: true, createdAt: true },
    })
    await tx.auditLog.create({
      data: {
        tenantId: tenant,
        userId: session.user.id,
        action: vigente ? 'CUSTOMER_PORTAL_TOKEN_REGENERATED' : 'CUSTOMER_PORTAL_TOKEN_CREATED',
        entity: 'Customer',
        entityId: customer.id,
        metadata: { level, regenerated: Boolean(vigente) },
      },
    })
    return token
  })
  // El token en claro viaja una sola vez (para el enlace/QR); en la base queda
  // únicamente su sha256.
  return json({ level: creado.level, token: tokenEnClaro, regenerated: Boolean(vigente), reused: false, createdAt: creado.createdAt })
}
