import { MOBOS_ALLOWED_APP_ORIGINS } from './identity'
import { RucLookupError, normalizeRuc } from './ruc'

export function publicRucOriginAllowed(origin: string | null) {
  if (!origin) return false
  if ((MOBOS_ALLOWED_APP_ORIGINS as readonly string[]).includes(origin)) return true
  try {
    if (!process.env.MOBOS_APP_URL) return false
    const configured = new URL(process.env.MOBOS_APP_URL)
    return ['https:', 'http:'].includes(configured.protocol) && origin === configured.origin
  } catch { return false }
}

export function publicRucInput(request: Request) {
  if (!publicRucOriginAllowed(request.headers.get('origin'))) throw new RucLookupError('origin_forbidden', 'Origen no permitido.', 403)
  const params = new URL(request.url).searchParams
  if (params.getAll('ruc').length !== 1 || [...params.keys()].some(key => key !== 'ruc' && key !== 'subjectKind')) {
    throw new RucLookupError('invalid_ruc', 'Ingresá únicamente el RUC que querés consultar.', 400)
  }
  return normalizeRuc(params.get('ruc')).lookup
}
