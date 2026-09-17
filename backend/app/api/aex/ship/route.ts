import { prisma } from '../../../../lib/prisma'
import { error, json } from '../../../../lib/http'
import { requireSession } from '../../../../lib/auth'
import { aexQuote, aexShip, aexWebTrackingUrl } from '../../../../lib/aex'

// Envío AEX de un traslado entre sucursales: cotiza (o confirma) usando las
// ciudades de las sucursales. Sin credenciales devuelve `unconfigured` con el
// link web; ante cualquier falla del proveedor devuelve `unavailable`.
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
  const origen = transfer.sourceBranch?.city || 'Asunción'
  const destino = transfer.destinationBranch?.city || 'Ciudad del Este'
  const cotizaciones = await aexQuote(origen, destino, pesoKg)
  if (cotizaciones === null) return json({ unconfigured: true, webUrl: aexWebTrackingUrl(''), quotes: [] })
  if (body.confirm !== true) return json({ unconfigured: false, quotes: cotizaciones, origen, destino })
  const resultado = await aexShip(origen, destino, pesoKg, `MOBOS-TR-${transfer.id}`, transfer.sourceBranch?.address || '', transfer.destinationBranch?.address || '')
  if (!resultado) return json({ unavailable: true, webUrl: aexWebTrackingUrl('') })
  await prisma.stockTransfer.update({ where: { id: transfer.id }, data: { aexGuide: resultado.guide } })
  await prisma.auditLog.create({ data: { tenantId: session.user.tenantId, userId: session.user.id, action: 'TRANSFER_AEX_SHIPPED', entity: 'StockTransfer', entityId: transfer.id, metadata: { guide: resultado.guide, costPyg: resultado.costPyg, service: resultado.serviceName } } })
  return json({ ok: true, guide: resultado.guide, costPyg: resultado.costPyg, serviceName: resultado.serviceName, webUrl: aexWebTrackingUrl(resultado.guide) })
}
