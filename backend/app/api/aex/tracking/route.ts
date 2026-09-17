import { prisma } from '../../../../lib/prisma'
import { error, json } from '../../../../lib/http'
import { requireSession } from '../../../../lib/auth'
import { aexTracking, aexWebTrackingUrl } from '../../../../lib/aex'

// Seguimiento AEX por número de guía. Primero los eventos que AEX ya notificó
// por webhook (sin depender del proveedor); si no hay, se consulta la API. Sin
// credenciales responde `unconfigured` para que la interfaz abra la web.
export async function GET(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  const guia = (new URL(request.url).searchParams.get('guia') || '').trim().slice(0, 200)
  if (!guia) return error('Indicá el número de guía.')
  const guardados = await prisma.aexWebhookEvent.findMany({
    where: { guia },
    orderBy: [{ fechaEvento: 'desc' }, { recibidoEn: 'desc' }],
    take: 100,
  })
  if (guardados.length) {
    return json({
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
  if (eventos === null) return json({ unconfigured: true, webUrl: aexWebTrackingUrl(guia), events: [] })
  return json({ unconfigured: false, webUrl: aexWebTrackingUrl(guia), source: 'api', events: eventos })
}
