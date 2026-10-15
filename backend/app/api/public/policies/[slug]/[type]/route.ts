import { error, json } from '../../../../../../lib/http'
import { enforceRateLimit } from '../../../../../../lib/rate-limit'
import { POLICY_LABELS, isPolicyType } from '../../../../../../lib/policies'
import { empresaPublicaPorSlug, politicaPublica } from '../../../../../../lib/public-policies'

// Una política publicada de la empresa (#433). Un borrador responde 404 igual
// que una que no existe: no se revela que hay un texto sin publicar.
export async function GET(request: Request, context: { params: Promise<{ slug: string; type: string }> }) {
  const limited = enforceRateLimit(request, 'public-policies', 60, 60_000)
  if (limited) return limited
  const { slug, type } = await context.params
  if (!isPolicyType(type)) return error('Política no encontrada.', 404)
  const empresa = await empresaPublicaPorSlug(String(slug || '').toLowerCase())
  if (!empresa || !empresa.policies[type].published) return error('Política no encontrada.', 404)
  return json({
    company: empresa.company,
    policy: politicaPublica(empresa.policies, type),
    others: empresa.publicadas.filter(other => other !== type).map(other => ({ type: other, label: POLICY_LABELS[other] })),
  })
}
