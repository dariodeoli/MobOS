import { prisma } from '../../../../../../lib/prisma'
import { error, json, tenantId } from '../../../../../../lib/http'
import { canAccessAny, requireSession } from '../../../../../../lib/auth'
import { aexTracking, aexWebTrackingUrl } from '../../../../../../lib/aex'

// #250 Fase 6: seguimiento AEX de un lote entrante por su guía (la que se cargó
// con `aex-guide`). Primero los eventos que AEX ya notificó por webhook; si no
// hay, se consulta la API. Sin credenciales responde `unconfigured` con la URL
// web para abrir el seguimiento.
type RouteContext = { params: Promise<{ id: string }> }

export async function GET(request: Request, context: RouteContext) {
  const tenant = await tenantId(request)
  if (!tenant) return error('Falta sesión.', 401)
  const session = await requireSession(request)
  if (!session) return error('Sesión inválida.', 401)
  if (!canAccessAny(session.user, ['stock:manage'])) return error('No autorizado.', 403)

  const { id } = await context.params
  const envio = await prisma.supplyShipment.findFirst({ where: { id, tenantId: tenant }, select: { code: true, guide: true, company: true, method: true, status: true } })
  if (!envio) return error('Envío no encontrado.', 404)
  const guia = (envio.guide || '').trim()
  if (!guia) return error('El envío todavía no tiene guía cargada.', 404)

  const guardados = await prisma.aexWebhookEvent.findMany({
    where: { guia },
    orderBy: [{ fechaEvento: 'desc' }, { recibidoEn: 'desc' }],
    take: 100,
  })
  if (guardados.length) {
    return json({
      envio: envio.code,
      guia,
      unconfigured: false,
      webUrl: aexWebTrackingUrl(guia),
      source: 'webhook',
      events: guardados.map((evento) => ({
        fecha: (evento.fechaEvento || evento.recibidoEn).toISOString(),
        estado: evento.estado || '',
        tipoEvento: evento.tipoEvento || '',
        observacion: evento.observacion || '',
      })),
    })
  }
  const eventos = await aexTracking(guia)
  if (eventos === null) return json({ envio: envio.code, guia, unconfigured: true, webUrl: aexWebTrackingUrl(guia), source: 'web', events: [] })
  return json({ envio: envio.code, guia, unconfigured: false, webUrl: aexWebTrackingUrl(guia), source: 'api', events: eventos })
}
