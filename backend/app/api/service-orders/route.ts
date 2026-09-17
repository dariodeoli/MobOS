import { Prisma } from '@prisma/client'
import { prisma } from '../../../lib/prisma'
import { error, json, tenantId } from '../../../lib/http'
import { requireSession } from '../../../lib/auth'
import { InputError, objectInput, textInput } from '../../../lib/payment-input'

// Pipeline del taller: el estado avanza en este orden y ENTREGADO cierra la orden.
const STATUS = ['RECIBIDO', 'DIAGNOSTICO', 'CON_TECNICO', 'ESPERANDO_REPUESTO', 'REPARADO', 'LISTO', 'ENTREGADO', 'CANCELADO']
const INT_MAX = 2147483647
const safeInt = (value: unknown, minimum = 0): value is number => Number.isSafeInteger(value) && (value as number) >= minimum && (value as number) <= INT_MAX
const clean = (value: unknown, max: number) => typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null

export async function GET(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  const query = new URL(request.url).searchParams
  const q = (query.get('q') || '').trim()
  const status = query.get('status') || ''
  const orders = await prisma.serviceOrder.findMany({
    where: {
      tenantId: tenant,
      ...(STATUS.includes(status) ? { status } : {}),
      ...(q ? { OR: [
        { customerName: { contains: q, mode: 'insensitive' } },
        { device: { contains: q, mode: 'insensitive' } },
        { serial: { contains: q, mode: 'insensitive' } },
        { reportedIssue: { contains: q, mode: 'insensitive' } },
        { diagnosis: { contains: q, mode: 'insensitive' } },
        { technicianName: { contains: q, mode: 'insensitive' } },
      ] } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
  return json(orders)
}

export async function POST(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  try {
    const body = objectInput(await request.json())
    const customerName = clean(body.customerName, 200)
    const device = clean(body.device, 200)
    if (!customerName || !device) throw new InputError('Cliente y dispositivo son obligatorios.')
    const status = typeof body.status === 'string' && STATUS.includes(body.status) ? body.status : 'RECIBIDO'
    const pricePyg = body.pricePyg === undefined || body.pricePyg === '' || body.pricePyg === null ? 0 : Number(body.pricePyg)
    const costPyg = body.costPyg === undefined || body.costPyg === '' || body.costPyg === null ? 0 : Number(body.costPyg)
    if (!safeInt(pricePyg) || !safeInt(costPyg)) throw new InputError('Precio y costo deben ser enteros válidos.')
    const created = await prisma.serviceOrder.create({
      data: {
        tenantId: tenant,
        branchId: session.user.branchId || null,
        customerId: clean(body.customerId, 200),
        customerName,
        device,
        serviceName: clean(body.serviceName, 200),
        serial: clean(body.serial, 100),
        reportedIssue: clean(body.reportedIssue, 2000),
        diagnosis: clean(body.diagnosis, 2000),
        checklist: body.checklist && typeof body.checklist === 'object' && !Array.isArray(body.checklist) ? (body.checklist as Prisma.InputJsonValue) : {},
        technicianId: clean(body.technicianId, 200),
        technicianName: clean(body.technicianName, 200),
        status,
        pricePyg,
        costPyg,
        notes: clean(body.notes, 2000),
      },
    })
    await prisma.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'SERVICE_ORDER_CREATED', entity: 'ServiceOrder', entityId: created.id, metadata: { device, customerName, status } } })
    return json(created, { status: 201 })
  } catch (cause) {
    return error(cause instanceof Error ? cause.message : 'No se pudo crear la orden de servicio.', 400)
  }
}

export async function PATCH(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  try {
    const body = objectInput(await request.json())
    const id = textInput(body.id, 'id', 200)
    const existing = await prisma.serviceOrder.findFirst({ where: { id, tenantId: tenant } })
    if (!existing) return error('Orden de servicio no encontrada.', 404)
    const status = body.status === undefined ? undefined : String(body.status)
    if (status !== undefined && !STATUS.includes(status)) throw new InputError('Estado de servicio inválido.')
    const pricePyg = body.pricePyg === undefined || body.pricePyg === '' || body.pricePyg === null ? undefined : Number(body.pricePyg)
    const costPyg = body.costPyg === undefined || body.costPyg === '' || body.costPyg === null ? undefined : Number(body.costPyg)
    if (pricePyg !== undefined && !safeInt(pricePyg)) throw new InputError('Precio inválido.')
    if (costPyg !== undefined && !safeInt(costPyg)) throw new InputError('Costo inválido.')
    const updated = await prisma.serviceOrder.update({
      where: { id: existing.id },
      data: {
        ...(status === undefined ? {} : { status }),
        ...(status === 'ENTREGADO' && existing.status !== 'ENTREGADO' ? { deliveredAt: new Date() } : {}),
        ...(pricePyg === undefined ? {} : { pricePyg }),
        ...(costPyg === undefined ? {} : { costPyg }),
        ...(body.diagnosis === undefined ? {} : { diagnosis: clean(body.diagnosis, 2000) }),
        ...(body.serviceName === undefined ? {} : { serviceName: clean(body.serviceName, 200) }),
        ...(body.checklist === undefined || typeof body.checklist !== 'object' || Array.isArray(body.checklist) ? {} : { checklist: body.checklist as Prisma.InputJsonValue }),
        ...(body.reportedIssue === undefined ? {} : { reportedIssue: clean(body.reportedIssue, 2000) }),
        ...(body.serial === undefined ? {} : { serial: clean(body.serial, 100) }),
        ...(body.notes === undefined ? {} : { notes: clean(body.notes, 2000) }),
        ...(body.technicianId === undefined ? {} : { technicianId: clean(body.technicianId, 200) }),
        ...(body.technicianName === undefined ? {} : { technicianName: clean(body.technicianName, 200) }),
      },
    })
    if (status !== undefined && status !== existing.status) {
      await prisma.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'SERVICE_ORDER_STATUS', entity: 'ServiceOrder', entityId: updated.id, metadata: { previous: existing.status, current: status } } })
    }
    return json(updated)
  } catch (cause) {
    return error(cause instanceof Error ? cause.message : 'No se pudo actualizar la orden de servicio.', 400)
  }
}
