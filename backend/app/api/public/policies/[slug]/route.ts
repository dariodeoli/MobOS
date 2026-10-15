import { error, json } from '../../../../../lib/http'
import { enforceRateLimit } from '../../../../../lib/rate-limit'
import { POLICY_LABELS } from '../../../../../lib/policies'
import { empresaPublicaPorSlug } from '../../../../../lib/public-policies'

// Índice público de políticas de la empresa (#433): sin sesión, por slug, solo
// las políticas publicadas y los datos de contacto del negocio.
export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  const limited = enforceRateLimit(request, 'public-policies', 60, 60_000)
  if (limited) return limited
  const { slug } = await context.params
  const empresa = await empresaPublicaPorSlug(String(slug || '').toLowerCase())
  if (!empresa) return error('Tienda no encontrada.', 404)
  return json({
    company: empresa.company,
    policies: empresa.publicadas.map(type => ({ type, label: POLICY_LABELS[type], updatedAt: empresa.policies[type].updatedAt })),
  })
}
