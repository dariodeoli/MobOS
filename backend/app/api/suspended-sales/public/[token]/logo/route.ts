import { cargarCarritoPublico } from '../../../../../../lib/public-cart'
import { logoDelDocumentoPublico } from '../../../../../../lib/public-logo'
import { error } from '../../../../../../lib/http'

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params
  const access = await cargarCarritoPublico(token)
  if (!access.ok) return error(access.message, access.status)
  return logoDelDocumentoPublico(request, access.row.tenantId)
}
