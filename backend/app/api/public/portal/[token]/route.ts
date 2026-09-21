import { prisma } from '../../../../../lib/prisma'
import { error, json } from '../../../../../lib/http'
import { enforceRateLimit } from '../../../../../lib/rate-limit'
import { buscarPorTokenPublico, hashTokenPublico } from '../../../../../lib/public-token'

// Vitrina pública del cliente: una página de solo lectura por token donde ve
// sus pedidos, su saldo a favor, sus puntos de fidelización y —si el enlace es
// de nivel completo— sus garantías activas. El token es aleatorio y no
// enumerable; la respuesta sale siempre acotada al tenant y al cliente dueño
// del token. Nunca expone teléfonos, direcciones, pagos individuales, costos
// ni datos de otro cliente.
const MAX_PEDIDOS = 20
const MAX_GARANTIAS = 50

const texto = (value: unknown, max = 200) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : '')

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const limited = enforceRateLimit(request, 'public-client-portal', 30, 60_000)
  if (limited) return limited

  const { token } = await context.params
  // `CustomerPortalToken` no tiene vencimiento: la vigencia es no revocado.
  // Resolución por hash (#172/#178) con fallback a enlaces legacy en claro.
  const limpiar = texto(token)
  const { row: portal, hash, legacy } = await buscarPorTokenPublico(
    limpiar,
    (tokenHash) => prisma.customerPortalToken.findFirst({
      where: { tokenHash, revokedAt: null },
      select: {
        id: true,
        level: true,
        tenantId: true,
        customerId: true,
        customer: { select: { name: true, loyaltyPointsPyg: true, publicNote: true } },
        tenant: { select: { name: true, logos: { select: { id: true }, take: 1 } } },
      },
    }),
    (legacyToken) => prisma.customerPortalToken.findFirst({
      where: { token: legacyToken, revokedAt: null },
      select: {
        id: true,
        level: true,
        tenantId: true,
        customerId: true,
        customer: { select: { name: true, loyaltyPointsPyg: true, publicNote: true } },
        tenant: { select: { name: true, logos: { select: { id: true }, take: 1 } } },
      },
    }),
  )
  if (!portal) return error('Cuenta no encontrada.', 404)
  if (legacy && hash) {
    await prisma.customerPortalToken.updateMany({ where: { id: portal.id, tokenHash: null }, data: { tokenHash: hash } }).catch(() => {})
  }

  const completo = portal.level === 'completo'
  const [pedidos, saldoFavor, garantias] = await Promise.all([
    prisma.order.findMany({
      where: { tenantId: portal.tenantId, customerId: portal.customerId, archivedAt: null },
      select: {
        orderNumber: true,
        createdAt: true,
        totalPyg: true,
        status: true,
        fulfillmentStatus: true,
        payments: { where: { status: 'CONFIRMED' }, select: { amountPyg: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: MAX_PEDIDOS,
    }),
    prisma.storeCredit.aggregate({
      where: { tenantId: portal.tenantId, customerId: portal.customerId, remainingPyg: { gt: 0 } },
      _sum: { remainingPyg: true },
    }),
    completo
      ? prisma.warrantyCase.findMany({
          where: { tenantId: portal.tenantId, customerId: portal.customerId, status: { not: 'DELIVERED' } },
          select: { serial: true, description: true, status: true, expiresAt: true },
          orderBy: { createdAt: 'desc' },
          take: MAX_GARANTIAS,
        })
      : Promise.resolve([]),
  ])

  return json({
    nivel: portal.level,
    tienda: { nombre: portal.tenant?.name || null, tieneLogo: Boolean(portal.tenant?.logos?.length) },
    cliente: {
      nombre: portal.customer?.name || null,
      // Nota pública de la tienda (issue #127): solo viaja si existe; la nota
      // interna sigue prohibida en el portal.
      ...(portal.customer?.publicNote ? { notaPublica: portal.customer.publicNote } : {}),
    },
    saldoFavorPyg: Number(saldoFavor._sum.remainingPyg || 0),
    // 1 punto = 1 Gs. canjeable; la empresa lo apaga con loyaltyPct = 0.
    puntosPyg: Number(portal.customer?.loyaltyPointsPyg || 0),
    pedidos: pedidos.map((pedido) => {
      const cobrado = pedido.payments.reduce((sum, pago) => sum + Number(pago.amountPyg || 0), 0)
      return {
        numero: pedido.orderNumber,
        fecha: pedido.createdAt,
        estado: pedido.status,
        fulfillmentStatus: pedido.fulfillmentStatus,
        totalPyg: pedido.totalPyg,
        // Un pedido cancelado no deja deuda pendiente aunque no tenga pagos.
        saldoPyg: pedido.status === 'CANCELLED' ? 0 : Math.max(0, Number(pedido.totalPyg) - cobrado),
      }
    }),
    garantias: garantias.map((garantia) => ({
      serial: garantia.serial,
      producto: garantia.description,
      estado: garantia.status,
      venceAt: garantia.expiresAt,
    })),
  })
}
