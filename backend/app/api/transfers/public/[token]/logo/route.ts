import { cargarRemitoPublico } from '../../../../../../lib/public-transfer'
import { logoDelDocumentoPublico } from '../../../../../../lib/public-logo'
import { error } from '../../../../../../lib/http'
import { enforceRateLimit } from '../../../../../../lib/rate-limit'

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const limited = enforceRateLimit(request, 'public-transfer-logo', 30, 60_000)
  if (limited) { limited.headers.set('Cache-Control', 'no-store'); return limited }
  const { token } = await context.params
  const access = await cargarRemitoPublico(token)
  if (!access) {
    const response = error('Remito no encontrado.', 404)
    response.headers.set('Cache-Control', 'no-store')
    return response
  }
  return logoDelDocumentoPublico(request, access.tenantId)
}
