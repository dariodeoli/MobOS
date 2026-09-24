import { prisma } from '../../../../lib/prisma'
import { error, json, tenantId } from '../../../../lib/http'
import { canAccessAny, requireSession } from '../../../../lib/auth'
import { rendimientoProveedor, tiemposDeTransito } from '../../../../lib/supply-forecast'

// #250 Fase 6: rendimiento por proveedor (compras, monto, plazo de reposición,
// puntualidad vs. ETA, faltantes/incidencias) y tiempos reales de tránsito por
// ruta y método — incluido CDE→ASU — para decidir a quién y cómo comprar.
const DIAS_VENTANA = 180

export async function GET(request: Request) {
  const tenant = await tenantId(request)
  if (!tenant) return error('Falta sesión.', 401)
  const session = await requireSession(request)
  if (!session) return error('Sesión inválida.', 401)
  if (!canAccessAny(session.user, ['stock:manage'])) return error('No autorizado.', 403)

  const params = new URL(request.url).searchParams
  const desde = params.get('desde') ? new Date(String(params.get('desde'))) : new Date(Date.now() - DIAS_VENTANA * 86400000)
  if (Number.isNaN(desde.getTime())) return error('Fecha desde inválida.')

  const [compras, itemsRecepcion, envios] = await Promise.all([
    prisma.supplyPurchase.findMany({
      where: { tenantId: tenant, createdAt: { gte: desde } },
      take: 500,
      include: {
        supplier: { select: { id: true, name: true } },
        lines: { select: { quantity: true } },
        shipments: { select: { id: true, etaAt: true, sentAt: true, arrivedAt: true, status: true } },
      },
    }),
    prisma.supplyReceptionItem.findMany({
      where: { tenantId: tenant, reception: { status: 'CONFIRMADA', shipment: { purchase: { createdAt: { gte: desde } } } } },
      select: { resultado: true, reception: { select: { shipment: { select: { purchaseId: true } } } } },
    }),
    prisma.supplyShipment.findMany({
      where: { tenantId: tenant, createdAt: { gte: desde } },
      take: 500,
      select: { code: true, origin: true, method: true, status: true, sentAt: true, arrivedAt: true, etaAt: true, destinationBranch: { select: { name: true } }, items: { select: { id: true } } },
    }),
  ])

  const faltantesDe = new Map<string, number>()
  const incidenciasDe = new Map<string, number>()
  for (const item of itemsRecepcion) {
    const purchaseId = item.reception?.shipment?.purchaseId
    if (!purchaseId) continue
    if (item.resultado === 'FALTANTE') faltantesDe.set(purchaseId, (faltantesDe.get(purchaseId) || 0) + 1)
    else if (['SOBRANTE', 'DANADO', 'INCORRECTO'].includes(item.resultado)) incidenciasDe.set(purchaseId, (incidenciasDe.get(purchaseId) || 0) + 1)
  }

  const proveedores = rendimientoProveedor(compras.map((compra) => {
    const recibido = compra.shipments.filter((envio) => envio.arrivedAt).sort((a, b) => new Date(b.arrivedAt!).getTime() - new Date(a.arrivedAt!).getTime())[0] || null
    const eta = recibido?.etaAt || compra.shipments.map((envio) => envio.etaAt).filter(Boolean).sort((a, b) => new Date(a!).getTime() - new Date(b!).getTime())[0] || null
    return {
      supplierId: compra.supplier?.id || null,
      supplierName: compra.supplier?.name || compra.supplierName || 'Sin proveedor',
      unidades: compra.lines.reduce((suma, linea) => suma + linea.quantity, 0),
      costPyg: compra.costPyg || 0,
      creadaEl: compra.createdAt,
      despachadaEl: recibido?.sentAt || null,
      recibidaEl: recibido?.arrivedAt || null,
      etaEl: eta,
      faltantes: faltantesDe.get(compra.id) || 0,
      incidencias: incidenciasDe.get(compra.id) || 0,
      lotes: compra.shipments.length,
    }
  }))

  const rutas = tiemposDeTransito(envios.map((envio) => ({
    origen: envio.origin,
    destino: envio.destinationBranch?.name || null,
    metodo: envio.method,
    salidaEl: envio.sentAt,
    llegadaEl: envio.arrivedAt,
    etaEl: envio.etaAt,
    estado: envio.status,
    unidades: envio.items.length,
  })))

  return json({
    fecha: new Date().toISOString(),
    ventanaDias: DIAS_VENTANA,
    desde: desde.toISOString(),
    totales: { compras: compras.length, proveedores: proveedores.length, rutas: rutas.length, envios: envios.length },
    proveedores,
    rutas,
  })
}
