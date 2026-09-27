import { error, json } from '../../../../lib/http'
import { despacharEventosDeTodos } from '../../../../lib/web-push-eventos'

// A1 (#279): despacho programado (scheduler) para dispositivos con la app
// cerrada. Mismo patrón que los recordatorios de cuotas: token de mantenimiento.
export async function POST(request: Request) {
  const esperado = process.env.MOBOS_MAINTENANCE_TOKEN
  if (!esperado) return error('El mantenimiento programado todavía no está configurado.', 503)
  const recibido = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (recibido !== esperado) return error('No autorizado.', 401)
  return json(await despacharEventosDeTodos({}))
}
