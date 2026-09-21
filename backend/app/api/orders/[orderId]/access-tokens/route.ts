import { randomBytes } from 'node:crypto'
import { prisma } from '../../../../../lib/prisma'
import { error, json, tenantId } from '../../../../../lib/http'
import { requireSession } from '../../../../../lib/auth'
import { InputError, objectInput } from '../../../../../lib/payment-input'
import { canAccessOrder } from '../../../../../lib/orders'

const ACCESS_LEVELS = ['rapido', 'completo', 'detallado'] as const

const nuevoToken = () => randomBytes(24).toString('base64url')

async function pedidoAccesible(request: Request, orderId: string) {
  const tenant = await tenantId(request)
  const session = await requireSession(request)
  if (!tenant || !session) return { error: error('Falta sesión.', 401) as Response }
  const order = await prisma.order.findFirst({
    where: { id: orderId, tenantId: tenant },
    select: { id: true, tenantId: true, sellerId: true, branchId: true },
  })
  if (!order || !canAccessOrder(session.user, order)) return { error: error('Pedido no encontrado.', 404) as Response }
  return { order, session }
}

// Accesos públicos activos del pedido, por nivel de información. El panel solo
// lista y administra los enlaces compartibles: los tokens del QR impreso
// (impreso=true) viven aparte para que regenerar un enlace no invalide el papel.
export async function GET(request: Request, context: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await context.params
  const acceso = await pedidoAccesible(request, orderId)
  if ('error' in acceso) return acceso.error
  const tokens = await prisma.orderAccessToken.findMany({
    where: { orderId: acceso.order.id, revokedAt: null, impreso: false },
    select: { level: true, token: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  })
  return json({ tokens })
}

// Devuelve el acceso del nivel pedido (lo crea si falta). Con regenerate=true
// revoca el token vigente y genera uno nuevo: el anterior deja de funcionar.
// Con impreso=true devuelve el token del QR impreso, que el panel no regenera.
// Con revokeAll=true (acción «Regenerar acceso QR») revoca TODOS los accesos
// vigentes del pedido —impresos y compartidos— y emite uno nuevo: los códigos
// anteriores dejan de abrir la vista.
export async function POST(request: Request, context: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await context.params
  const acceso = await pedidoAccesible(request, orderId)
  if ('error' in acceso) return acceso.error
  try {
    const body = objectInput(await request.json())
    const level = typeof body.level === 'string' ? body.level : ''
    if (!ACCESS_LEVELS.includes(level as (typeof ACCESS_LEVELS)[number])) throw new InputError('Nivel de comprobante inválido.')
    const regenerate = body.regenerate === true
    const impreso = body.impreso === true
    const revokeAll = body.revokeAll === true

    const vigente = await prisma.orderAccessToken.findFirst({
      where: { orderId: acceso.order.id, level, impreso, revokedAt: null },
      select: { id: true, token: true },
      orderBy: { createdAt: 'desc' },
    })
    if (vigente && !regenerate && !revokeAll) return json({ level, token: vigente.token, impreso, regenerated: false })

    const creado = await prisma.$transaction(async tx => {
      if (revokeAll) {
        await tx.orderAccessToken.updateMany({
          where: { orderId: acceso.order.id, revokedAt: null },
          data: { revokedAt: new Date() },
        })
      } else if (vigente) {
        await tx.orderAccessToken.update({ where: { id: vigente.id }, data: { revokedAt: new Date() } })
      }
      return tx.orderAccessToken.create({
        data: {
          orderId: acceso.order.id,
          tenantId: acceso.order.tenantId,
          level,
          impreso,
          token: nuevoToken(),
          createdBy: acceso.session.user.id,
        },
        select: { level: true, token: true, createdAt: true },
      })
    })
    return json({ ...creado, impreso, regenerated: Boolean(vigente) || revokeAll, revoked: revokeAll })
  } catch (cause) {
    return error(cause instanceof Error ? cause.message : 'No se pudo preparar el acceso.', 400)
  }
}
