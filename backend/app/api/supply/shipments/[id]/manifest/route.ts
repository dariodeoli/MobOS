import { prisma } from '../../../../../../lib/prisma'
import { error, json, tenantId } from '../../../../../../lib/http'
import { canAccessAny, requireSession } from '../../../../../../lib/auth'
import { manifiestoEnvio } from '../../../../../../lib/supply'

// #250 Fase 4 (§11): manifiesto del envío entrante — lo que se imprime con el
// código grande, el QR de recepción y los IMEI registrados/pendientes.
type RouteContext = { params: Promise<{ id: string }> }

export async function GET(request: Request, { params }: RouteContext) {
  const tenant = await tenantId(request)
  if (!tenant) return error('Falta sesión.', 401)
  const session = await requireSession(request)
  if (!session) return error('Sesión inválida.', 401)
  if (!canAccessAny(session.user, ['stock:manage'])) return error('No autorizado.', 403)

  const { id } = await params
  const envio = await prisma.supplyShipment.findFirst({
    where: { id: String(id || ''), tenantId: tenant },
    include: {
      purchase: { select: { code: true, supplierName: true } },
      destinationBranch: { select: { name: true } },
      responsible: { select: { name: true } },
      items: {
        orderBy: { createdAt: 'asc' },
        include: { line: { select: { id: true } }, product: { select: { name: true, capacity: true } } },
      },
    },
  })
  if (!envio) return error('Envío no encontrado.', 404)

  const base = (process.env.MOBOS_APP_URL || new URL(request.url).origin).replace(/\/$/, '')
  const items = envio.items.map((item) => ({
    lineId: item.lineId,
    producto: item.product?.name || '',
    capacidad: item.product?.capacity || '',
    condicion: '',
    serial: item.serial,
  }))
  // La condición vive en la línea de compra; se completa sin otra consulta.
  const lineas = envio.items.length ? await prisma.supplyPurchaseLine.findMany({ where: { id: { in: [...new Set(envio.items.map((item) => item.lineId))] }, tenantId: tenant }, select: { id: true, condition: true } }) : []
  const condicionDe = new Map(lineas.map((linea) => [linea.id, linea.condition]))
  const manifiesto = manifiestoEnvio({ envio, items: items.map((item) => ({ ...item, condicion: condicionDe.get(item.lineId) || 'NEW' })), base })
  return json({ ...manifiesto, proveedor: envio.purchase?.supplierName || null })
}
