import { prisma } from '../../../../../lib/prisma'
import { error, json, tenantId } from '../../../../../lib/http'
import { canAccessAny, requireSession } from '../../../../../lib/auth'

// #250 Fase 4: historial por unidad (serial/IMEI) del Centro de Abastecimiento.
// Encadena lo que la spec pide ver: necesidad → compra → lote → estado, y si la
// unidad ya está en stock, la ficha del inventario. No crea ni mueve nada.
type RouteContext = { params: Promise<{ serial: string }> }

export async function GET(request: Request, { params }: RouteContext) {
  const tenant = await tenantId(request)
  if (!tenant) return error('Falta sesión.', 401)
  const session = await requireSession(request)
  if (!session) return error('Sesión inválida.', 401)
  if (!canAccessAny(session.user, ['stock:manage'])) return error('No autorizado.', 403)

  const { serial } = await params
  const buscado = String(serial || '').trim().toUpperCase().slice(0, 64)
  if (buscado.length < 4) return error('Serial inválido.', 400)

  const [unidad, compraSerial] = await Promise.all([
    prisma.inventoryUnit.findFirst({ where: { tenantId: tenant, serial: buscado }, select: { id: true, status: true, branch: { select: { name: true } }, location: { select: { name: true, code: true } }, createdAt: true } }),
    prisma.supplyPurchaseSerial.findFirst({
      where: { tenantId: tenant, serial: buscado },
      include: {
        line: {
          include: {
            need: { select: { id: true, source: true, status: true, promisedAt: true, branch: { select: { name: true } } } },
            shipmentItems: {
              include: { shipment: { include: { destinationBranch: { select: { name: true } }, purchase: { select: { code: true } } } } },
            },
            purchase: { select: { id: true, code: true, supplierName: true, status: true, reference: true, createdAt: true } },
            product: { select: { name: true, capacity: true } },
          },
        },
      },
    }),
  ])

  // La unidad puede viajar en un solo lote; se listan los items de ESTE serial
  // (no los de la línea) y se dedupean por envío.
  const itemsDelSerial = (compraSerial?.line.shipmentItems || []).filter((item) => String(item.serial || '').toUpperCase() === buscado)
  const vistos = new Set<string>()
  const lotes = itemsDelSerial.filter((item) => (vistos.has(item.shipmentId) ? false : (vistos.add(item.shipmentId), true))).map((item) => ({
    envio: item.shipment.code,
    metodo: item.shipment.method,
    origen: item.shipment.origin,
    destino: item.shipment.destinationBranch?.name || null,
    estado: item.shipment.status,
    estadoUnidad: item.status,
    salida: item.shipment.sentAt,
    eta: item.shipment.etaAt,
    llegada: item.shipment.arrivedAt,
  }))

  return json({
    serial: buscado,
    // En stock (ya recibida) o en la cadena de abastecimiento.
    enStock: Boolean(unidad),
    unidad: unidad ? { id: unidad.id, estado: unidad.status, sucursal: unidad.branch?.name || null, ubicacion: [unidad.location?.code, unidad.location?.name].filter(Boolean).join(' · ') || null, ingresadaEl: unidad.createdAt } : null,
    compra: compraSerial?.line.purchase ? { code: compraSerial.line.purchase.code, proveedor: compraSerial.line.purchase.supplierName, referencia: compraSerial.line.purchase.reference, estado: compraSerial.line.purchase.status, fecha: compraSerial.line.purchase.createdAt } : null,
    producto: compraSerial?.line.product ? { nombre: compraSerial.line.product.name, capacidad: compraSerial.line.product.capacity } : null,
    necesidad: compraSerial?.line.need ? { id: compraSerial.line.need.id, origen: compraSerial.line.need.source, estado: compraSerial.line.need.status, destino: compraSerial.line.need.branch?.name || null, prometidaEl: compraSerial.line.need.promisedAt } : null,
    lotes,
  })
}
