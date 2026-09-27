import { error, json } from '../../../../lib/http'
import { requireSession } from '../../../../lib/auth'
import { clavePublicaWebPush, webPushConfigured } from '../../../../lib/web-push'

// A1 (#279): clave pública VAPID para que el navegador cree la suscripción.
// Sin configurar responde `{ configurado: false }` y la UI lo explica.
export async function GET(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Sesión inválida.', 401)
  return json({ configurado: webPushConfigured(), clave: clavePublicaWebPush() })
}
