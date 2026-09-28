import { Prisma } from '@prisma/client'
import { prisma } from '../../../lib/prisma'
import { error, json, tenantId } from '../../../lib/http'
import { requireSession } from '../../../lib/auth'
import { serialKey } from '../../../lib/validation'
import { TRANSIT_ESTADOS, vincularAsignacionAlRecibir } from '../../../lib/transit'

// #279 (A4) · Vender en tránsito: asignaciones futuras de unidades que todavía
// viajan. Cualquier vendedor/encargado puede apartar una unidad **en tránsito**
// de su sucursal para una venta (con o sin pedido creado): esa unidad futura
// queda bloqueada para el resto y, al recibirla, el IMEI se vincula solo al
// pedido que la esperaba (ver `inventory-units/verify`).
const text = (value: unknown, max = 500) => typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null
const verTodas = (role: string) => ['ADMIN', 'GERENTE'].includes(role)
// El serial plano (viene en la unidad) simplifica la lectura desde el panel.
const conSerial = (fila: Record<string, unknown> | null) => fila ? { ...fila, serial: (fila.unit as { serial?: string } | undefined)?.serial || null } : null
const detalle = {
  unit: { select: { id: true, serial: true, status: true, branchId: true, productId: true, locationId: true, product: { select: { id: true, name: true, sku: true, capacity: true } }, branch: { select: { id: true, name: true } } } },
  seller: { select: { id: true, name: true } },
  order: { select: { id: true, orderNumber: true, status: true, customer: { select: { id: true, name: true } } } },
  customer: { select: { id: true, name: true, phone: true } },
  branch: { select: { id: true, name: true } },
} satisfies Prisma.TransitAssignmentInclude

export async function GET(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  const params = new URL(request.url).searchParams
  const estado = (params.get('status') || '').trim().toUpperCase()
  const serial = serialKey(params.get('q') || params.get('serial') || '')
  const orderId = text(params.get('orderId'), 128)
  const mio = params.get('mine') === '1'
  const limite = Math.min(200, Math.max(1, Number(params.get('limit')) || 50))
  const filas = await prisma.transitAssignment.findMany({
    where: {
      tenantId: tenant,
      ...(estado && TRANSIT_ESTADOS.includes(estado as never) ? { status: estado } : {}),
      ...(orderId ? { orderId } : {}),
      ...(mio || !verTodas(session.user.role) ? { sellerId: session.user.id } : {}),
      ...(serial ? { unit: { serial: { contains: serial, mode: 'insensitive' as const } } } : {}),
    },
    orderBy: [{ createdAt: 'desc' }],
    take: limite,
    include: detalle,
  })
  return json({ fecha: new Date().toISOString(), total: filas.length, asignaciones: filas.map(conSerial) })
}

export async function POST(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  let body: any; try { body = await request.json() } catch { return error('JSON inválido.') }
  const serial = serialKey(body?.serial)
  const unitId = text(body?.unitId, 128)
  if (!serial && !unitId) return error('Indicá el IMEI/serial o la unidad a apartar.')
  const orderId = text(body?.orderId, 128)
  const orderItemId = text(body?.orderItemId, 128)
  const customerId = text(body?.customerId, 128)
  const customerName = text(body?.customerName, 160)
  const notes = text(body?.notes, 500)
  try {
    const asignacion = await prisma.$transaction(async tx => {
      const unit = await tx.inventoryUnit.findFirst({
        where: { tenantId: tenant, ...(unitId ? { id: unitId } : { serial }) },
        select: { id: true, serial: true, status: true, branchId: true, productId: true },
      })
      if (!unit) throw new Error('No encontramos esa unidad.')
      // Solo unidades futuras: lo que ya está disponible se reserva o se vende
      // por los flujos normales.
      if (unit.status !== 'IN_TRANSIT') throw new Error('Solo se puede apartar un equipo que está en tránsito.')
      if (!verTodas(session.user.role) && unit.branchId !== session.user.branchId) throw new Error('Ese equipo viaja a otra sucursal.')
      const viva = await tx.transitAssignment.findFirst({ where: { tenantId: tenant, unitId: unit.id, status: { not: 'LIBERADA' } }, select: { id: true, seller: { select: { name: true } } } })
      if (viva) throw new Error(`Ese equipo ya está apartado para otra venta${viva.seller?.name ? ` (${viva.seller.name})` : ''}.`)
      let clienteDePedido: string | null = null
      if (orderId) {
        const order = await tx.order.findFirst({ where: { id: orderId, tenantId: tenant }, select: { id: true, customer: { select: { id: true, name: true } } } })
        if (!order) throw new Error('El pedido no existe o no es de esta empresa.')
        if (orderItemId && !(await tx.orderItem.findFirst({ where: { id: orderItemId, orderId: order.id }, select: { id: true } }))) throw new Error('La línea del pedido no corresponde.')
        clienteDePedido = order.customer?.name || null
      }
      if (customerId && !(await tx.customer.findFirst({ where: { id: customerId, tenantId: tenant }, select: { id: true } }))) throw new Error('El cliente no existe.')
      const creada = await tx.transitAssignment.create({
        data: {
          tenantId: tenant,
          unitId: unit.id,
          orderId,
          orderItemId,
          customerId,
          customerName: customerName || clienteDePedido,
          sellerId: session.user.id,
          branchId: unit.branchId,
          notes,
        },
        include: detalle,
      })
      await tx.auditLog.create({
        data: {
          tenantId: tenant,
          userId: session.user.id,
          action: 'TRANSIT_UNIT_ASSIGNED',
          entity: 'TransitAssignment',
          entityId: creada.id,
          metadata: { serial: unit.serial, unitId: unit.id, orderId, orderItemId, customerId, customerName: creada.customerName, branchId: unit.branchId },
        },
      })
      return creada
    })
    return json({ asignacion: conSerial(asignacion) }, { status: 201 })
  } catch (cause) {
    const mensaje = cause instanceof Error ? cause.message : 'No se pudo apartar el equipo.'
    // El índice único parcial es la garantía final contra la doble asignación.
    if ((cause as { code?: string })?.code === 'P2002') return error('Ese equipo ya está apartado para otra venta.', 409)
    return error(mensaje, /apartado para otra venta|otra sucursal/.test(mensaje) ? 409 : 400)
  }
}

export async function PATCH(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  let body: any; try { body = await request.json() } catch { return error('JSON inválido.') }
  const id = text(body?.id, 128)
  const accion = ['release', 'update', 'link'].includes(String(body?.action)) ? String(body.action) : null
  if (!id || !accion) return error('Indicá la asignación y la acción (release, update o link).')
  try {
    const resultado = await prisma.$transaction(async tx => {
      const asignacion = await tx.transitAssignment.findFirst({ where: { id, tenantId: tenant }, include: { unit: { select: { id: true, serial: true, status: true, branchId: true } } } })
      if (!asignacion) throw new Error('No encontramos esa asignación.')
      const propia = asignacion.sellerId === session.user.id || verTodas(session.user.role)
      if (!propia) throw new Error('Solo quien la apartó (o gerencia) puede cambiarla.')
      if (asignacion.status === 'LIBERADA') throw new Error('Esa asignación ya fue liberada.')
      if (accion === 'release') {
        const liberada = await tx.transitAssignment.update({ where: { id: asignacion.id }, data: { status: 'LIBERADA', releasedAt: new Date() } })
        await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'TRANSIT_UNIT_RELEASED', entity: 'TransitAssignment', entityId: asignacion.id, metadata: { serial: asignacion.unit.serial, orderId: asignacion.orderId } } })
        return liberada
      }
      if (accion === 'update') {
        const actualizada = await tx.transitAssignment.update({
          where: { id: asignacion.id },
          data: {
            ...(body?.customerName === undefined ? {} : { customerName: text(body.customerName, 160) }),
            ...(body?.customerId === undefined ? {} : { customerId: text(body.customerId, 128) }),
            ...(body?.notes === undefined ? {} : { notes: text(body.notes, 500) }),
          },
          include: detalle,
        })
        return actualizada
      }
      // link: fuerza el vínculo (gerencia), por ejemplo si la recepción se hizo
      // antes de crear la asignación.
      if (asignacion.status === 'VINCULADA') return asignacion
      if (asignacion.unit.status !== 'IN_TRANSIT' && asignacion.unit.status !== 'AVAILABLE' && asignacion.unit.status !== 'RESERVED') throw new Error('La unidad no se puede vincular en su estado actual.')
      const vinculada = await vincularAsignacionAlRecibir(tx, { tenantId: tenant, unit: asignacion.unit, userId: session.user.id })
      return vinculada
    })
    return json({ asignacion: conSerial(resultado) })
  } catch (cause) { return error(cause instanceof Error ? cause.message : 'No se pudo actualizar la asignación.', 409) }
}
