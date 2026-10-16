import { cargarUnidadInforme } from '../../../../../../lib/public-unit'
import { logoDelDocumentoPublico } from '../../../../../../lib/public-logo'
import { error } from '../../../../../../lib/http'
import { prisma } from '../../../../../../lib/prisma'

export async function GET(request: Request, context: { params: Promise<{ serial: string }> }) {
  const { serial } = await context.params
  const normalized = String(serial || '').trim().slice(0, 64)
  if (normalized.length < 6) return error('Serial inválido.', 400)
  const access = await cargarUnidadInforme(prisma, normalized)
  if (!access) return error('Equipo no encontrado.', 404)
  return logoDelDocumentoPublico(request, access.elegida.tenantId)
}
