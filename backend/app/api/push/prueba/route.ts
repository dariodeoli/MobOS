import { error, json, tenantId } from '../../../../lib/http'
import { requireSession } from '../../../../lib/auth'
import { enviarWebPush } from '../../../../lib/web-push'

// A1 (#279): aviso de prueba al propio usuario (verifica permiso, VAPID y SW).
export async function POST(request: Request) {
  const tenant = await tenantId(request)
  if (!tenant) return error('Falta sesión.', 401)
  const session = await requireSession(request)
  if (!session) return error('Sesión inválida.', 401)
  const resultado = await enviarWebPush({
    tenantId: tenant,
    userId: session.user.id,
    titulo: 'Aviso de prueba',
    cuerpo: 'Si ves esto, las notificaciones del navegador funcionan.',
    url: '/mi-cuenta',
    tag: 'mobos-prueba',
  })
  if (!resultado.configurado) return error('El envío de notificaciones no está configurado.', 503)
  return json(resultado)
}
