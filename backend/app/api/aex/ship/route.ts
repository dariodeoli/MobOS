import { prisma } from '../../../../lib/prisma'
import { error, json } from '../../../../lib/http'
import { requireSession } from '../../../../lib/auth'
import { aexQuote, aexWebTrackingUrl } from '../../../../lib/aex'

// Cotiza el traslado entre sucursales; la confirmación queda bloqueada hasta
// contar con datos reales del remitente y destinatario.
export async function POST(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!['ADMIN', 'GERENTE'].includes(session.user.role)) return error('No autorizado.', 403)
  let body: any; try { body = await request.json() } catch { return error('JSON inválido.') }
  const transferId = typeof body?.transferId === 'string' ? body.transferId : ''
  const pesoKg = Number(body?.pesoKg || 1)
  if (!transferId || !Number.isFinite(pesoKg) || pesoKg <= 0 || pesoKg > 500) return error('Indicá el traslado y un peso válido en kg.')
  const transfer = await prisma.stockTransfer.findFirst({
    where: { id: transferId, tenantId: session.user.tenantId },
    include: { sourceBranch: { select: { city: true, address: true } }, destinationBranch: { select: { city: true, address: true } } },
  })
  if (!transfer) return error('Traslado no encontrado.', 404)
  if (body.confirm === true) return error('La confirmación de envíos AEX está deshabilitada hasta contar con datos reales del remitente y destinatario.', 501)
  const origen = transfer.sourceBranch?.city || 'Asunción'
  const destino = transfer.destinationBranch?.city || 'Ciudad del Este'
  const cotizaciones = await aexQuote(origen, destino, pesoKg)
  if (cotizaciones === null) return json({ unconfigured: true, webUrl: aexWebTrackingUrl(''), quotes: [] })
  return json({ unconfigured: false, quotes: cotizaciones, origen, destino })
}
