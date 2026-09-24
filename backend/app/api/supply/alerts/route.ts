import { prisma } from '../../../../lib/prisma'
import { error, json, tenantId } from '../../../../lib/http'
import { canAccessAny, requireSession } from '../../../../lib/auth'
import { enviosAtrasados, necesidadesAtrasadas } from '../../../../lib/supply-forecast'

// #250 Fase 6: alertas de atraso — lotes sin llegar con la ETA vencida y
// necesidades con fecha prometida al cliente ya pasada. Solo lectura; el panel
// las usa para priorizar compras y reclamos.
const ESTADOS_EN_CAMINO = ['DESPACHADO', 'EN_TRANSITO', 'CON_INCIDENCIA']
const ESTADOS_NECESIDAD_ABIERTA = ['ABIERTA', 'ASIGNADA']

export async function GET(request: Request) {
  const tenant = await tenantId(request)
  if (!tenant) return error('Falta sesión.', 401)
  const session = await requireSession(request)
  if (!session) return error('Sesión inválida.', 401)
  if (!canAccessAny(session.user, ['stock:manage'])) return error('No autorizado.', 403)

  const params = new URL(request.url).searchParams
  const branchId = (params.get('branchId') || '').trim()
  const ahora = new Date()

  const [envios, necesidades] = await Promise.all([
    prisma.supplyShipment.findMany({
      where: { tenantId: tenant, status: { in: ESTADOS_EN_CAMINO }, etaAt: { lt: ahora }, ...(branchId ? { destinationBranchId: branchId } : {}) },
      orderBy: { etaAt: 'asc' },
      take: 200,
      include: { purchase: { select: { code: true } }, destinationBranch: { select: { id: true, name: true } }, items: { select: { id: true } } },
    }),
    prisma.supplyNeed.findMany({
      where: { tenantId: tenant, status: { in: ESTADOS_NECESIDAD_ABIERTA }, promisedAt: { lt: ahora }, ...(branchId ? { branchId } : {}) },
      orderBy: { promisedAt: 'asc' },
      take: 200,
      include: { product: { select: { id: true, name: true } }, branch: { select: { id: true, name: true } } },
    }),
  ])

  const porCode = new Map(envios.map((envio) => [envio.code, envio]))
  const atrasados = enviosAtrasados({
    ahora,
    envios: envios.map((envio) => ({
      code: envio.code,
      origen: envio.origin,
      destino: envio.destinationBranch?.name || null,
      metodo: envio.method,
      estado: envio.status,
      etaEl: envio.etaAt,
    })),
  }).map((fila) => {
    const envio = porCode.get(fila.code)
    return { ...fila, id: envio?.id || null, compra: envio?.purchase?.code || null, unidades: envio?.items.length || 0 }
  })

  const necesidadesVencidas = necesidadesAtrasadas({
    ahora,
    necesidades: necesidades.map((necesidad) => ({
      id: necesidad.id,
      productId: necesidad.productId,
      producto: necesidad.product?.name || null,
      branchId: necesidad.branchId,
      sucursal: necesidad.branch?.name || null,
      quantity: necesidad.quantity,
      prioridad: necesidad.priority,
      prometidaEn: necesidad.promisedAt,
      orderId: necesidad.orderId,
      source: necesidad.source,
    })),
  })

  return json({
    fecha: ahora.toISOString(),
    totales: { atrasados: atrasados.length, necesidadesVencidas: necesidadesVencidas.length, unidadesAtrasadas: atrasados.reduce((suma, fila) => suma + (fila.unidades || 0), 0) },
    atrasados,
    necesidadesVencidas,
  })
}
