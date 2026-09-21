import { prisma } from '../../../../../lib/prisma'
import { PurchaseStatus } from '@prisma/client'
import { error, json } from '../../../../../lib/http'
import { requireSession } from '../../../../../lib/auth'
import { csvResponse } from '../../../../../lib/csv'
import {
  KARDEX_MOVIMIENTO_LABEL,
  cargaInicialDocumentada,
  construirKardex,
  eventosDeCompras,
  eventosDeDevolucionesProveedor,
  eventosDeProducto,
  eventosDeTransferencias,
  eventosDeUnidades,
  eventosDeVentas,
} from '../../../../../lib/kardex'
import type { AdjuntoSerialKardex, RestitucionKardex } from '../../../../../lib/kardex'

type RouteContext = { params: Promise<{ id: string }> }

const ROLES_KARDEX = ['ADMIN', 'GERENTE', 'VENDEDOR', 'CAJERA']
const MAX_FILAS = 5000
const ACCIONES_RESTITUCION = ['ORDER_VOIDED', 'ORDER_RETURN_RECORDED', 'ORDER_CANCELLED']

// `hasta` con solo fecha cierra el día completo; el panel manda ISO local.
function fecha(valor: string | null, finDeDia = false): Date | null {
  if (!valor) return null
  const fecha = new Date(valor)
  if (Number.isNaN(fecha.getTime())) return null
  if (finDeDia && /^\d{4}-\d{2}-\d{2}$/.test(valor)) fecha.setUTCHours(23, 59, 59, 999)
  return fecha
}

const fechaCorta = (valor: Date) => valor.toISOString()
const numero = (valor: unknown) => (Number.isFinite(Number(valor)) ? Number(valor) : 0)

// Kardex del producto: historial de movimientos con saldo corrido. Se deriva de
// compras, ventas, transferencias, devoluciones y altas/bajas de unidades; el
// saldo inicial cierra contra el stock actual, así que la última línea siempre
// coincide con lo que muestra el catálogo. `format=csv` exporta el mismo rango.
export async function GET(request: Request, { params }: RouteContext) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!ROLES_KARDEX.includes(session.user.role)) return error('No autorizado.', 403)
  const tenant = session.user.tenantId
  const id = ((await params).id || '').trim().slice(0, 128)
  if (!id) return error('Producto obligatorio.')

  const url = new URL(request.url)
  const desde = fecha(url.searchParams.get('desde'))
  const hasta = fecha(url.searchParams.get('hasta'), true)
  if (desde && hasta && desde.getTime() > hasta.getTime()) return error('El rango de fechas es inválido.')
  const formato = url.searchParams.get('format') === 'csv' ? 'csv' : 'json'

  const producto = await prisma.product.findFirst({
    where: { id, tenantId: tenant, isActive: true },
    select: { id: true, sku: true, name: true, stock: true, branchId: true, createdAt: true },
  })
  if (!producto) return error('Producto no encontrado.', 404)
  if (['VENDEDOR', 'CAJERA'].includes(session.user.role) && producto.branchId && producto.branchId !== session.user.branchId) return error('No autorizado para esa sucursal.', 403)
  const verCostos = ['ADMIN', 'GERENTE'].includes(session.user.role)

  const [auditoriasProducto, compras, items, unidades, transferencias, devoluciones] = await Promise.all([
    prisma.auditLog.findMany({
      where: { tenantId: tenant, entity: 'Product', entityId: id, action: { in: ['PRODUCT_CREATED', 'PRODUCT_UPDATED'] } },
      select: { id: true, action: true, createdAt: true, metadata: true, user: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
      take: 2000,
    }),
    prisma.purchaseLine.findMany({
      where: { productId: id, receivedQty: { gt: 0 }, purchase: { tenantId: tenant, status: { in: [PurchaseStatus.PARTIAL, PurchaseStatus.RECEIVED] } } },
      select: { id: true, receivedQty: true, lotReference: true, unitCostPyg: true, finalUnitCostPyg: true, purchase: { select: { id: true, supplierName: true, status: true, createdAt: true, receivedAt: true, createdBy: { select: { name: true } } } } },
      take: 500,
    }),
    prisma.orderItem.findMany({
      where: { productId: id, order: { tenantId: tenant } },
      select: { id: true, quantity: true, serials: true, serialsPending: true, unitPricePyg: true, order: { select: { id: true, orderNumber: true, status: true, createdAt: true, customer: { select: { name: true } }, seller: { select: { name: true } } } } },
      orderBy: { order: { createdAt: 'asc' } },
      take: 1000,
    }),
    prisma.inventoryUnit.findMany({ where: { tenantId: tenant, productId: id }, select: { id: true }, take: 2000 }),
    prisma.stockTransferLine.findMany({
      where: { OR: [{ sourceProductId: id }, { destinationProductId: id }], transfer: { tenantId: tenant } },
      select: { id: true, quantity: true, serials: true, sourceProductId: true, destinationProductId: true, transfer: { select: { id: true, createdAt: true, receivedAt: true, sourceBranch: { select: { name: true } }, destinationBranch: { select: { name: true } } } } },
      take: 500,
    }),
    prisma.purchaseReturnLine.findMany({
      where: { productId: id, purchaseReturn: { tenantId: tenant } },
      select: { id: true, quantity: true, unitCostPyg: true, purchaseReturn: { select: { id: true, createdAt: true, reason: true, purchase: { select: { supplierName: true } } } } },
      take: 500,
    }),
  ])

  const orderIds = [...new Set(items.map(item => item.order.id))]
  const itemIds = items.map(item => item.id)
  const unitIds = unidades.map(unidad => unidad.id)
  const [auditoriasUnidad, restituciones, adjuntos] = await Promise.all([
    unitIds.length
      ? prisma.auditLog.findMany({
          where: { tenantId: tenant, entity: 'InventoryUnit', entityId: { in: unitIds }, action: { in: ['INVENTORY_UNIT_RECEIVED', 'INVENTORY_REMOVED', 'INVENTORY_RESTORED'] } },
          select: { id: true, entityId: true, action: true, createdAt: true, metadata: true, user: { select: { name: true } } },
          take: 3000,
        })
      : Promise.resolve([]),
    orderIds.length
      ? prisma.auditLog.findMany({
          where: { tenantId: tenant, entity: 'Order', entityId: { in: orderIds }, action: { in: ACCIONES_RESTITUCION } },
          select: { id: true, entityId: true, action: true, createdAt: true, metadata: true, user: { select: { name: true } } },
          take: 1000,
        })
      : Promise.resolve([]),
    itemIds.length
      ? prisma.auditLog.findMany({
          where: { tenantId: tenant, entity: 'Order', action: 'ORDER_SERIALS_ATTACHED', entityId: { in: orderIds } },
          select: { id: true, createdAt: true, metadata: true, user: { select: { name: true } } },
          take: 2000,
        })
      : Promise.resolve([]),
  ])

  const adjuntosPorItem = new Map<string, AdjuntoSerialKardex[]>()
  for (const auditoria of adjuntos) {
    const metadata = (auditoria.metadata && typeof auditoria.metadata === 'object' ? auditoria.metadata : {}) as Record<string, unknown>
    const itemId = typeof metadata.itemId === 'string' ? metadata.itemId : null
    const seriales = Array.isArray(metadata.serials) ? metadata.serials.length : 0
    if (!itemId || !seriales) continue
    const lista = adjuntosPorItem.get(itemId) ?? []
    lista.push({ itemId, at: auditoria.createdAt, cantidad: seriales, user: auditoria.user?.name ?? null })
    adjuntosPorItem.set(itemId, lista)
  }
  const restitucionesPorPedido = new Map<string, RestitucionKardex[]>()
  for (const auditoria of restituciones) {
    const orderId = auditoria.entityId
    if (!orderId) continue
    const metadata = (auditoria.metadata && typeof auditoria.metadata === 'object' ? auditoria.metadata : {}) as Record<string, unknown>
    // Las anulaciones restauran stock siempre; las devoluciones solo si la
    // ruta registró reposición (restock NONE no mueve nada).
    if (auditoria.action !== 'ORDER_VOIDED' && auditoria.action !== 'ORDER_CANCELLED' && (metadata.restock === undefined || metadata.restock === 'NONE')) continue
    const lista = restitucionesPorPedido.get(orderId) ?? []
    lista.push({ orderId, at: auditoria.createdAt, action: auditoria.action, restock: typeof metadata.restock === 'string' ? metadata.restock : null, reference: typeof metadata.reason === 'string' ? metadata.reason : null, user: auditoria.user?.name ?? null })
    restitucionesPorPedido.set(orderId, lista)
  }

  const eventos = [
    ...eventosDeProducto(auditoriasProducto),
    ...eventosDeCompras(compras, { costos: verCostos }),
    ...eventosDeVentas(items, adjuntosPorItem, restitucionesPorPedido, { precios: true }),
    ...eventosDeTransferencias(transferencias, producto.id),
    ...eventosDeDevolucionesProveedor(devoluciones, { costos: verCostos }),
    ...eventosDeUnidades(auditoriasUnidad),
  ]
  const kardex = construirKardex(eventos, producto.stock, { desde, hasta, limite: MAX_FILAS })
  const cargaInicial = cargaInicialDocumentada(auditoriasProducto.find(auditoria => auditoria.action === 'PRODUCT_CREATED')?.metadata)

  if (formato === 'csv') {
    const encabezados = ['Fecha', 'Movimiento', 'Detalle', 'Referencia', 'Usuario', 'Entrada', 'Salida', 'Saldo']
    const filas: Array<Array<string | number>> = [
      ['', 'Saldo inicial', desde ? `al ${desde.toISOString().slice(0, 10)}` : 'antes del primer movimiento', '', '', '', '', kardex.saldoInicial],
      ...kardex.movimientos.map(movimiento => [
        movimiento.at.toISOString(),
        KARDEX_MOVIMIENTO_LABEL[movimiento.kind],
        `${movimiento.estimated ? '(reconstruido) ' : ''}${movimiento.label}${movimiento.detail ? ` · ${movimiento.detail}` : ''}`,
        movimiento.reference ?? '',
        movimiento.user ?? '',
        movimiento.delta > 0 ? movimiento.delta : '',
        movimiento.delta < 0 ? -movimiento.delta : '',
        movimiento.saldo,
      ]),
    ]
    return csvResponse(encabezados, filas, `mobos-kardex-${producto.sku}.csv`)
  }

  return json({
    producto: { id: producto.id, sku: producto.sku, name: producto.name, stock: producto.stock, branchId: producto.branchId },
    desde: desde ? fechaCorta(desde) : null,
    hasta: hasta ? fechaCorta(hasta) : null,
    cargaInicial,
    sinDocumentar: !desde && cargaInicial !== null ? kardex.saldoInicial - cargaInicial : null,
    ...kardex,
    movimientos: kardex.movimientos.map(movimiento => ({ ...movimiento, at: fechaCorta(movimiento.at) })),
    verCostos,
    total: numero(kardex.total),
  })
}
