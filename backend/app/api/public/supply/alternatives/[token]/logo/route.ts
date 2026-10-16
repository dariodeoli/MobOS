import { cargarAlternativaPublica } from '../../../../../../../lib/public-alternative'
import { logoDelDocumentoPublico } from '../../../../../../../lib/public-logo'
import { error } from '../../../../../../../lib/http'

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params
  const access = await cargarAlternativaPublica(token)
  if (!access) return error('Propuesta no encontrada.', 404)
  return logoDelDocumentoPublico(request, access.tenantId)
}
