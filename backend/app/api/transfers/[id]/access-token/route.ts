import { randomBytes } from 'node:crypto'
import { prisma } from '../../../../../lib/prisma'
import { error, json } from '../../../../../lib/http'
import { requireSession } from '../../../../../lib/auth'

const nuevoToken = () => randomBytes(24).toString('base64url')

// Enlace/QR del remito para confirmar la recepción desde el destino. Devuelve
// el token vigente (lo crea si falta); con regenerate=true lo rota y el
// enlace anterior deja de funcionar.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (session.user.role !== 'ADMIN' && session.user.role !== 'GERENTE') return error('No autorizado.', 403)
  const tenant = session.user.tenantId
  const { id } = await context.params
  const transfer = await prisma.stockTransfer.findFirst({ where: { id: (id || '').trim().slice(0, 128), tenantId: tenant }, select: { id: true, sourceBranchId: true, publicToken: true } })
  if (!transfer) return error('Traslado no encontrado.', 404)
  if (session.user.role === 'GERENTE' && session.user.branchId !== transfer.sourceBranchId) return error('Solo podés compartir traslados de tu sucursal.', 403)

  let regenerate = false
  try {
    const raw = await request.text()
    if (raw) regenerate = JSON.parse(raw)?.regenerate === true
  } catch {
    return error('JSON inválido.')
  }

  if (transfer.publicToken && !regenerate) return json({ token: transfer.publicToken, regenerated: false })

  const token = nuevoToken()
  await prisma.$transaction(async tx => {
    await tx.stockTransfer.update({ where: { id: transfer.id }, data: { publicToken: token } })
    await tx.auditLog.create({ data: {
      tenantId: tenant,
      userId: session.user.id,
      action: transfer.publicToken ? 'TRANSFER_PUBLIC_TOKEN_REGENERATED' : 'TRANSFER_PUBLIC_TOKEN_CREATED',
      entity: 'StockTransfer',
      entityId: transfer.id,
      metadata: { regenerated: Boolean(transfer.publicToken) },
    } })
  })
  return json({ token, regenerated: Boolean(transfer.publicToken) })
}
