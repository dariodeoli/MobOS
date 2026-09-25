import { prisma } from '../../../../lib/prisma'
import { error, json, tenantId } from '../../../../lib/http'
import { canAccessAny, requireSession } from '../../../../lib/auth'
import { codigoRepuesto, deudaRepuesto, esPorPagar, estadoRepuesto, resumenRepuestos, validarRepuesto } from '../../../../lib/workshop-parts'

// #250 · Repuestos del taller con tenencia y pago.
//
// - GET   /api/workshop/parts            → listado con filtros (`?disponibles=1`,
//   `?porPagar=1`, `?serviceOrderId=`, `?ownership=`, `?paymentMode=`) + resumen.
//   `?id=` devuelve el repuesto con su trazabilidad (movimientos).
// - POST  /api/workshop/parts            → alta con dueño explícito (propio
//   contado/crédito o del proveedor en depósito/consignación/crédito).
// - PATCH /api/workshop/parts            → use (taller) · return (devolver al
//   proveedor) · pay (cuenta por pagar de FIN) · baja.
//
// Los repuestos **no** tocan el stock vendible: no crean InventoryUnit ni suman
// Product.stock; viven en sus propias tablas con auditoría y movimientos.
const INCLUDE_REPUESTO = {
  supplier: { select: { id: true, name: true, code: true } },
  product: { select: { id: true, name: true, sku: true } },
  location: { select: { id: true, name: true, code: true } },
  branch: { select: { id: true, name: true } },
  serviceOrder: { select: { id: true, serviceNumber: true, device: true } },
  createdBy: { select: { id: true, name: true } },
} as const

const puedeLeer = (user: { permissions: string[] }) => canAccessAny(user, ['stock:manage', 'stock:read', 'service:manage'])
const puedeGestionar = (user: { permissions: string[] }) => canAccessAny(user, ['stock:manage', 'purchases:manage'])

export async function GET(request: Request) {
  const tenant = await tenantId(request)
  if (!tenant) return error('Falta sesión.', 401)
  const session = await requireSession(request)
  if (!session) return error('Sesión inválida.', 401)
  if (!puedeLeer(session.user)) return error('No autorizado.', 403)

  const params = new URL(request.url).searchParams
  const id = (params.get('id') || '').trim()
  if (id) {
    const part = await prisma.workshopPart.findFirst({
      where: { id, tenantId: tenant },
      include: { ...INCLUDE_REPUESTO, movements: { orderBy: { createdAt: 'desc' }, take: 100, include: { user: { select: { id: true, name: true } }, serviceOrder: { select: { id: true, serviceNumber: true } } } } },
    })
    if (!part) return error('Repuesto no encontrado.', 404)
    return json({ part, deudaPyg: deudaRepuesto(part), porPagar: esPorPagar(part) })
  }

  const branchId = (params.get('branchId') || '').trim()
  const serviceOrderId = (params.get('serviceOrderId') || '').trim()
  const ownership = (params.get('ownership') || '').trim().toUpperCase()
  const paymentMode = (params.get('paymentMode') || '').trim().toUpperCase()
  const soloDisponibles = params.get('disponibles') === '1'
  const soloPorPagar = params.get('porPagar') === '1'
  const parts = await prisma.workshopPart.findMany({
    where: {
      tenantId: tenant,
      ...(branchId ? { branchId } : {}),
      ...(serviceOrderId ? { serviceOrderId } : {}),
      ...(ownership ? { ownership } : {}),
      ...(paymentMode ? { paymentMode } : {}),
      ...(soloDisponibles ? { status: 'DISPONIBLE', quantity: { gt: 0 } } : {}),
      ...(soloPorPagar ? { paidAt: null, paymentMode: { in: ['CREDITO', 'CONSIGNACION'] } } : {}),
    },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    take: Math.min(300, Math.max(1, Number(params.get('limit')) || 100)),
    include: INCLUDE_REPUESTO,
  })
  // La consignación suma deuda recién por lo usado: el filtro es en memoria.
  const visibles = soloPorPagar ? parts.filter(part => esPorPagar(part)) : parts
  return json({
    fecha: new Date().toISOString(),
    resumen: resumenRepuestos(visibles),
    parts: visibles.map(part => ({ ...part, deudaPyg: deudaRepuesto(part), porPagar: esPorPagar(part), estado: estadoRepuesto(part) })),
  })
}

export async function POST(request: Request) {
  const tenant = await tenantId(request)
  if (!tenant) return error('Falta sesión.', 401)
  const session = await requireSession(request)
  if (!session) return error('Sesión inválida.', 401)
  if (!puedeGestionar(session.user)) return error('No autorizado.', 403)

  let body: any
  try { body = await request.json() } catch { return error('JSON inválido.') }
  const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 160) : ''
  if (!name) return error('Indicá el nombre o modelo del repuesto.')
  const ownership = String(body?.ownership || 'PROPIO').toUpperCase()
  const paymentMode = String(body?.paymentMode || 'CONTADO').toUpperCase()
  const supplierId = typeof body?.supplierId === 'string' && body.supplierId.trim() ? body.supplierId.trim() : null
  const quantity = Number(body?.quantity ?? 1)
  const unitCostPyg = body?.unitCostPyg === undefined || body?.unitCostPyg === '' || body?.unitCostPyg === null ? null : Number(body.unitCostPyg)
  const totalCostPyg = body?.totalCostPyg === undefined || body?.totalCostPyg === '' || body?.totalCostPyg === null ? (unitCostPyg !== null ? unitCostPyg * quantity : null) : Number(body.totalCostPyg)
  const dueAt = typeof body?.dueAt === 'string' && body.dueAt.trim() ? new Date(body.dueAt) : null
  if (dueAt && Number.isNaN(dueAt.getTime())) return error('Vencimiento inválido.')
  const { error: invalido } = validarRepuesto({ ownership, paymentMode, supplierId, quantity, unitCostPyg, totalCostPyg, dueAt })
  if (invalido) return error(invalido)

  const productId = typeof body?.productId === 'string' && body.productId.trim() ? body.productId.trim() : null
  if (productId && !(await prisma.product.findFirst({ where: { id: productId, tenantId: tenant }, select: { id: true } }))) return error('Producto no encontrado.', 404)
  if (supplierId && !(await prisma.supplier.findFirst({ where: { id: supplierId, tenantId: tenant }, select: { id: true } }))) return error('Proveedor no encontrado.', 404)
  const locationId = typeof body?.locationId === 'string' && body.locationId.trim() ? body.locationId.trim() : null
  if (locationId && !(await prisma.stockLocation.findFirst({ where: { id: locationId, tenantId: tenant, isActive: true }, select: { id: true } }))) return error('Depósito no encontrado.', 404)
  const branchId = typeof body?.branchId === 'string' && body.branchId.trim() ? body.branchId.trim() : null
  const serviceOrderId = typeof body?.serviceOrderId === 'string' && body.serviceOrderId.trim() ? body.serviceOrderId.trim() : null
  if (serviceOrderId && !(await prisma.serviceOrder.findFirst({ where: { id: serviceOrderId, tenantId: tenant }, select: { id: true } }))) return error('Orden de servicio no encontrada.', 404)

  const creado = await prisma.$transaction(async (tx) => {
    const secuencia = (await tx.workshopPart.count({ where: { tenantId: tenant } })) + 1
    const part = await tx.workshopPart.create({
      data: {
        tenantId: tenant,
        code: codigoRepuesto(secuencia),
        productId,
        name,
        sku: typeof body?.sku === 'string' && body.sku.trim() ? body.sku.trim().slice(0, 60) : null,
        ownership,
        supplierId,
        paymentMode,
        quantity: Math.round(quantity),
        unitCostPyg,
        totalCostPyg,
        dueAt,
        paidAt: paymentMode === 'CONTADO' ? new Date() : null,
        locationId,
        branchId,
        serviceOrderId,
        status: 'DISPONIBLE',
        notes: typeof body?.notes === 'string' && body.notes.trim() ? body.notes.trim().slice(0, 500) : null,
        createdById: session.user.id,
      },
    })
    await tx.workshopPartMovement.create({ data: { tenantId: tenant, partId: part.id, kind: 'ALTA', quantity: Math.round(quantity), amountPyg: totalCostPyg, serviceOrderId, note: `${ownership} · ${paymentMode}`, userId: session.user.id } })
    await tx.auditLog.create({
      data: {
        tenantId: tenant,
        userId: session.user.id,
        action: 'WORKSHOP_PART_CREATED',
        entity: 'WorkshopPart',
        entityId: part.id,
        metadata: { code: part.code, name, ownership, paymentMode, quantity: Math.round(quantity), supplierId, locationId, branchId, totalCostPyg, dueAt: dueAt ? dueAt.toISOString() : null },
      },
    })
    return part
  })
  return json(await prisma.workshopPart.findFirst({ where: { id: creado.id, tenantId: tenant }, include: INCLUDE_REPUESTO }), { status: 201 })
}

export async function PATCH(request: Request) {
  const tenant = await tenantId(request)
  if (!tenant) return error('Falta sesión.', 401)
  const session = await requireSession(request)
  if (!session) return error('Sesión inválida.', 401)

  let body: any
  try { body = await request.json() } catch { return error('JSON inválido.') }
  const id = typeof body?.id === 'string' ? body.id.trim() : ''
  if (!id) return error('Indicá el repuesto.')
  const part = await prisma.workshopPart.findFirst({ where: { id, tenantId: tenant } })
  if (!part) return error('Repuesto no encontrado.', 404)

  const accion = ['use', 'return', 'pay', 'baja'].includes(body?.action) ? body.action : null
  if (!accion) return error('Acción inválida: usá use, return, pay o baja.')
  // El taller consume repuestos (service:manage); devolver/pagar/dar de baja es
  // de quien gestiona el stock o las compras.
  const autorizado = accion === 'use' ? puedeLeer(session.user) : puedeGestionar(session.user)
  if (!autorizado) return error('No autorizado.', 403)

  const cantidad = body?.quantity === undefined ? 1 : Number(body.quantity)
  const nota = typeof body?.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 300) : null
  const serviceOrderId = typeof body?.serviceOrderId === 'string' && body.serviceOrderId.trim() ? body.serviceOrderId.trim() : part.serviceOrderId

  if (accion === 'use' || accion === 'return' || accion === 'baja') {
    if (!Number.isSafeInteger(cantidad) || cantidad < 1 || cantidad > 9999) return error('Indicá una cantidad entera entre 1 y 9999.')
    if (cantidad > part.quantity) return error(`Solo quedan ${part.quantity} unidad(es) de ${part.code}.`, 409)
    if (accion === 'return' && part.ownership !== 'PROVEEDOR') return error('Solo se devuelven los repuestos del proveedor.', 409)
    if (accion === 'baja' && !nota) return error('Indicá el motivo de la baja.')
  }
  if (accion === 'pay' && part.paidAt) return error('El repuesto ya está pago.', 409)

  const actualizado = await prisma.$transaction(async (tx) => {
    const restante = part.quantity - (accion === 'use' || accion === 'return' || accion === 'baja' ? cantidad : 0)
    const usado = part.usedQuantity + (accion === 'use' ? cantidad : 0)
    const fila = await tx.workshopPart.update({
      where: { id: part.id },
      data: {
        ...(accion === 'use' ? { quantity: restante, usedQuantity: usado, status: estadoRepuesto({ quantity: restante }), ...(serviceOrderId ? { serviceOrderId } : {}) } : {}),
        ...(accion === 'return' ? { quantity: restante, status: restante === 0 ? 'DEVUELTO' : estadoRepuesto({ quantity: restante }) } : {}),
        ...(accion === 'baja' ? { quantity: restante, status: restante === 0 ? 'BAJA' : estadoRepuesto({ quantity: restante }) } : {}),
        ...(accion === 'pay' ? { paidAt: body?.paidAt ? new Date(String(body.paidAt)) : new Date() } : {}),
      },
    })
    const kind = accion === 'use' ? 'USO' : accion === 'return' ? 'DEVOLUCION' : accion === 'pay' ? 'PAGO' : 'BAJA'
    await tx.workshopPartMovement.create({ data: { tenantId: tenant, partId: fila.id, kind, quantity: accion === 'pay' ? 0 : cantidad, amountPyg: accion === 'pay' ? deudaRepuesto(part) : null, serviceOrderId, note: nota, userId: session.user.id } })
    await tx.auditLog.create({
      data: {
        tenantId: tenant,
        userId: session.user.id,
        action: accion === 'use' ? 'WORKSHOP_PART_USED' : accion === 'return' ? 'WORKSHOP_PART_RETURNED' : accion === 'pay' ? 'WORKSHOP_PART_PAID' : 'WORKSHOP_PART_DISCARDED',
        entity: 'WorkshopPart',
        entityId: fila.id,
        metadata: { code: fila.code, ownership: fila.ownership, paymentMode: fila.paymentMode, quantity: cantidad, restante: fila.quantity, serviceOrderId, deudaPyg: accion === 'pay' ? deudaRepuesto(part) : undefined, note: nota },
      },
    })
    return fila
  })
  const conDetalle = await prisma.workshopPart.findFirst({ where: { id: actualizado.id, tenantId: tenant }, include: INCLUDE_REPUESTO })
  return json({ part: conDetalle, deudaPyg: deudaRepuesto(conDetalle || {}), porPagar: esPorPagar(conDetalle || {}) })
}
