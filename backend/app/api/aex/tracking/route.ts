import { error, json } from '../../../../lib/http'
import { requireSession } from '../../../../lib/auth'
import { aexTracking, aexWebTrackingUrl } from '../../../../lib/aex'

// Seguimiento AEX por número de guía. Con credenciales devuelve los eventos de
// la API; sin ellas responde `unconfigured` para que la interfaz abra la web.
export async function GET(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  const guia = (new URL(request.url).searchParams.get('guia') || '').trim().slice(0, 200)
  if (!guia) return error('Indicá el número de guía.')
  const eventos = await aexTracking(guia)
  if (eventos === null) return json({ unconfigured: true, webUrl: aexWebTrackingUrl(guia), events: [] })
  return json({ unconfigured: false, webUrl: aexWebTrackingUrl(guia), events: eventos })
}
