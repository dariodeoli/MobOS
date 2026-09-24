import { prisma } from '../../../../../../lib/prisma'
import { error, json, tenantId } from '../../../../../../lib/http'
import { canAccessAny, requireSession } from '../../../../../../lib/auth'
import { etiquetasPreparacion, resumenPreparacion } from '../../../../../../lib/supply'

// #250 Fase 3 (§11): etiquetas de la preparación de una compra.
//
// Devuelve una etiqueta por unidad comprada (`PRODUCTO n DE N`, variante, IMEI
// o «pendiente», compra, pedido vinculado y destino) para que la app/PRN la
// impriman (80 mm/etiqueta térmica). No toca stock ni marca nada como recibido.
type RouteContext = { params: Promise<{ id: string }> }

export async function GET(request: Request, { params }: RouteContext) {
  const tenant = await tenantId(request)
  if (!tenant) return error('Falta sesión.', 401)
  const session = await requireSession(request)
  if (!session) return error('Sesión inválida.', 401)
  if (!canAccessAny(session.user, ['stock:manage'])) return error('No autorizado.', 403)

  const { id } = await params
  const compra = await prisma.supplyPurchase.findFirst({
    where: { id: String(id || ''), tenantId: tenant },
    include: {
      branch: { select: { name: true } },
      lines: {
        orderBy: { createdAt: 'asc' },
        include: {
          product: { select: { name: true, capacity: true } },
          need: { select: { orderId: true } },
          serials: { select: { serial: true } },
        },
      },
    },
  })
  if (!compra) return error('Compra no encontrada.', 404)

  // Pedido vinculado por línea (la etiqueta lo muestra cuando existe).
  const orderIds = [...new Set(compra.lines.map((linea) => linea.need?.orderId).filter(Boolean))] as string[]
  const pedidos = orderIds.length ? await prisma.order.findMany({ where: { id: { in: orderIds }, tenantId: tenant }, select: { id: true, orderNumber: true } }) : []
  const numeroDe = new Map(pedidos.map((pedido) => [pedido.id, pedido.orderNumber]))
  const lineas = compra.lines.map((linea) => ({
    productId: linea.productId,
    producto: linea.product?.name || '',
    capacidad: linea.product?.capacity || '',
    condicion: linea.condition,
    quantity: linea.quantity,
    serials: linea.serials.map((fila) => fila.serial),
    pedidoNumero: linea.need?.orderId ? numeroDe.get(linea.need.orderId) || null : null,
  }))

  const etiquetas = etiquetasPreparacion({ compra: compra.code, lineas, destino: compra.branch?.name || null })
  return json({
    compra: { id: compra.id, code: compra.code, referencia: compra.reference, proveedor: compra.supplierName, destino: compra.branch?.name || null },
    resumen: resumenPreparacion(lineas),
    etiquetas: etiquetas.map((etiqueta) => ({ ...etiqueta, referencia: compra.reference })),
  })
}
