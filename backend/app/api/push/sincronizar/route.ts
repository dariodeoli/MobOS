import { error, json, tenantId } from '../../../../lib/http'
import { requireSession } from '../../../../lib/auth'
import { despacharEventosWebPush } from '../../../../lib/web-push-eventos'

// A1 (#279): despacha los eventos nuevos del usuario conectado (la app lo llama
// al abrir y cada pocos minutos). Dedupe por evento: nunca repite un aviso.
export async function POST(request: Request) {
  const tenant = await tenantId(request)
  if (!tenant) return error('Falta sesión.', 401)
  const session = await requireSession(request)
  if (!session) return error('Sesión inválida.', 401)
  return json(await despacharEventosWebPush({ tenantId: tenant, userId: session.user.id }))
}
