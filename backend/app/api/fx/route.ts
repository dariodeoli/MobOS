import { error, json } from '../../../lib/http'
import { requireSession } from '../../../lib/auth'
import { prisma } from '../../../lib/prisma'
import { FxUnavailableError, fxSettingsFrom, getFxQuote, isFxCurrency, pickRate } from '../../../lib/fx'
import type { FxPurpose } from '../../../lib/fx'

// Cotización de referencia para cobros y costos en moneda extranjera (#401).
// Fuente y lado salen de Configuración → Comercial (por defecto Cambios Chaco ·
// venta); la caché por fuente es del servidor y se comparte entre empresas.
// Siempre queda editable a mano: sin dato, 503 con manualEntryAllowed.
export async function GET(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Sesión inválida.', 401)
  const params = new URL(request.url).searchParams
  const purpose: FxPurpose = params.get('purpose') === 'costs' ? 'costs' : 'sales'
  const currency = (params.get('currency') || 'USD').toUpperCase()
  if (!isFxCurrency(currency)) return error('Moneda no soportada.', 400)
  const tenant = await prisma.tenant.findUnique({ where: { id: session.user.tenantId }, select: { settings: true } })
  const rule = fxSettingsFrom(tenant?.settings)[purpose]
  try {
    const { quote, sourceLabel, fetchedAt, cached, stale } = await getFxQuote(rule.source, currency)
    const rate = pickRate(quote, rule.side)
    return json({
      purpose, currency, source: quote.source, sourceLabel, side: rule.side, rate,
      compra: quote.compra, venta: quote.venta, updatedAt: quote.updatedAt, fetchedAt, cached, stale,
      // Compatibilidad con clientes anteriores a #401.
      referencialDiario: rate,
    })
  } catch (cause) {
    const known = cause instanceof FxUnavailableError
    if (!known) console.error('[fx] error inesperado:', cause)
    return error(known ? cause.message : 'No se pudo obtener la cotización. Cargala manualmente.', 503, { code: known ? cause.code : 'fx_unavailable', manualEntryAllowed: true })
  }
}
