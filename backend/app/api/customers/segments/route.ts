import { error, json } from '../../../../lib/http'
import { requireSession } from '../../../../lib/auth'
import { consultarClientes } from '../../../../lib/customer-segments'
import { SEGMENTOS, clasificarCliente, motivoNoElegible, opcionesSegmento, puedeGestionarMarketing, type SegmentoKey } from '../../../../lib/segments'

// Segmentos de clientes para campañas de recompra. Marketing no queda abierto
// a los roles de venta: solo administración y gerencia listan segmentos.
const LIMITE_MAX = 500

export async function GET(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!puedeGestionarMarketing(session.user.role)) return error('No autorizado.', 403)
  const tenantId = session.user.tenantId
  const params = new URL(request.url).searchParams
  const segment = (params.get('segment') || 'INACTIVE').trim().toUpperCase() as SegmentoKey
  if (!SEGMENTOS.some((item) => item.key === segment)) return error('Segmento inválido.')
  const opciones = opcionesSegmento({
    days: params.get('days') ?? undefined,
    minOrders: params.get('minOrders') ?? undefined,
    category: params.get('category') ?? undefined,
    cooldownDays: params.get('cooldownDays') ?? undefined,
  })
  const limite = Math.min(LIMITE_MAX, Math.max(1, Number(params.get('limit')) || 200))
  const now = new Date()
  const clientes = await consultarClientes(tenantId, { segmento: segment, opciones })
  const delSegmento = clientes.filter((cliente) => clasificarCliente(cliente, segment, opciones, now))
  const rows = delSegmento.slice(0, limite).map((cliente) => {
    const reason = motivoNoElegible(cliente, now, opciones.cooldownDays)
    return {
      id: cliente.id,
      name: cliente.name,
      phone: cliente.phone,
      countryCode: cliente.countryCode,
      email: cliente.email,
      pricingTier: cliente.pricingTier,
      acceptsWhatsappMarketing: cliente.acceptsWhatsappMarketing,
      marketingContactedAt: cliente.marketingContactedAt,
      lastOrderAt: cliente.lastOrderAt,
      orderCount: cliente.orderCount,
      totalSpentPyg: cliente.totalSpentPyg,
      outstandingPyg: cliente.outstandingPyg,
      categories: cliente.categories,
      topCategory: cliente.categories[0] ?? null,
      eligible: reason === null,
      reason,
    }
  })
  return json({
    segment,
    segmento: SEGMENTOS.find((item) => item.key === segment),
    opciones,
    total: delSegmento.length,
    elegibles: rows.filter((row) => row.eligible).length,
    rows,
  })
}
