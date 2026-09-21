import { Prisma } from '@prisma/client'
import { ROLES_CON_DESBLOQUEO, cifrarSecreto, descifrarSecreto } from '../../../lib/secret-crypto'
import { nextServiceNumber } from '../../../lib/service-number'
import { prisma } from '../../../lib/prisma'
import { resolveCustomerId } from '../../../lib/customer-link'
import { error, json, tenantId } from '../../../lib/http'
import { canAccessAny, requireSession } from '../../../lib/auth'
import { InputError, objectInput, textInput } from '../../../lib/payment-input'

// Pipeline del taller: el estado avanza en este orden y ENTREGADO cierra la orden.
const STATUS = ['RECIBIDO', 'DIAGNOSTICO', 'CON_TECNICO', 'ESPERANDO_REPUESTO', 'REPARADO', 'LISTO', 'ENTREGADO', 'CANCELADO']
const INT_MAX = 2147483647
const safeInt = (value: unknown, minimum = 0): value is number => Number.isSafeInteger(value) && (value as number) >= minimum && (value as number) <= INT_MAX
const clean = (value: unknown, max: number) => typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null

const USO_DESBLOQUEO = 'service-order-unlock'

// El taller es de administración, gerencia y técnicos: el resto de los roles no
// ve ni toca las órdenes de servicio.
const puedeOperar = (user: { permissions: string[] }) => canAccessAny(user, ['service:manage'])

// Costo opcional: ausente = no se toca; vacío/null = se limpia; el resto tiene
// que ser un entero. Un desglose se considera cargado solo si algún valor es
// mayor que 0: así "limpiar el desglose" vuelve al costo total directo.
const costoOpcional = (valor: unknown): number | null | undefined => {
  if (valor === undefined) return undefined
  if (valor === null || valor === '') return null
  const numero = Number(valor)
  if (!Number.isSafeInteger(numero) || numero < 0 || numero > INT_MAX) throw new InputError('El costo debe ser un entero válido.')
  return numero
}
const usaDesglose = (parts: number | null | undefined, labor: number | null | undefined, other: number | null | undefined) => [parts ?? 0, labor ?? 0, other ?? 0].some(valor => valor > 0)

// El secreto del equipo nunca sale crudo: se descifra solo para quien puede
// verlo (dueño, gerente y técnico) y el resto lo recibe en null.
function conDesbloqueo<T extends { id: string; unlockSecret?: string | null }>(orden: T, role: string) {
  const { unlockSecret, ...resto } = orden
  if (!unlockSecret || !ROLES_CON_DESBLOQUEO.includes(role)) return { ...resto, desbloqueo: null }
  try {
    return { ...resto, desbloqueo: descifrarSecreto(unlockSecret, { uso: USO_DESBLOQUEO, referencia: orden.id }) }
  } catch { return { ...resto, desbloqueo: null } }
}

// PIN y/o patrón de 3×3 (secuencia de puntos 1-9) que deja el cliente.
function leerDesbloqueo(body: Record<string, unknown>) {
  const pin = typeof body.unlockCode === 'string' ? body.unlockCode.trim().slice(0, 40) : ''
  const puntos = Array.isArray(body.unlockPattern)
    ? body.unlockPattern.map(Number).filter((punto) => Number.isInteger(punto) && punto >= 1 && punto <= 9).slice(0, 9)
    : []
  if (!pin && !puntos.length) return null
  return { ...(pin ? { pin } : {}), ...(puntos.length ? { patron: puntos } : {}) }
}

export async function GET(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (!puedeOperar(session.user)) return error('No autorizado.', 403)
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
  const customerIds = [...new Set(orders.map(order => order.customerId).filter((id): id is string => Boolean(id)))]
  const clientes = customerIds.length
    ? await prisma.customer.findMany({ where: { tenantId: tenant, id: { in: customerIds } }, select: { id: true, phone: true, countryCode: true } })
    : []
  const contactoPorCliente = new Map(clientes.map(cliente => [cliente.id, cliente]))
  return json(orders.map(order => ({
    ...conDesbloqueo(order, session.user.role),
    customerPhone: order.customerId ? contactoPorCliente.get(order.customerId)?.phone || null : null,
    customerCountryCode: order.customerId ? contactoPorCliente.get(order.customerId)?.countryCode || '+595' : '+595',
  })))
}

export async function POST(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (!puedeOperar(session.user)) return error('No autorizado.', 403)
  try {
    const body = objectInput(await request.json())
    const customerName = clean(body.customerName, 200)
    const device = clean(body.device, 200)
    if (!customerName || !device) throw new InputError('Cliente y dispositivo son obligatorios.')
    const status = typeof body.status === 'string' && STATUS.includes(body.status) ? body.status : 'RECIBIDO'
    const pricePyg = body.pricePyg === undefined || body.pricePyg === '' || body.pricePyg === null ? 0 : Number(body.pricePyg)
    const costPyg = body.costPyg === undefined || body.costPyg === '' || body.costPyg === null ? 0 : Number(body.costPyg)
    if (!safeInt(pricePyg) || !safeInt(costPyg)) throw new InputError('Precio y costo deben ser enteros válidos.')
    // Costo del trabajo: repuesto + mano de obra + otros. Si el desglose viene
    // cargado, el total se calcula; si no, vale el costo total directo.
    const partsPyg = costoOpcional(body.partsPyg)
    const laborPyg = costoOpcional(body.laborPyg)
    const otherCostPyg = costoOpcional(body.otherCostPyg)
    const conDesglose = usaDesglose(partsPyg, laborPyg, otherCostPyg)
    const costoTotal = conDesglose ? (partsPyg ?? 0) + (laborPyg ?? 0) + (otherCostPyg ?? 0) : costPyg
    if (!safeInt(costoTotal)) throw new InputError('El costo total supera el máximo permitido.')
    const created = await prisma.serviceOrder.create({
      data: {
        tenantId: tenant,
        branchId: session.user.branchId || null,
        customerId: await resolveCustomerId(prisma, tenant, body.customerId, customerName),
        customerName,
        device,
        serviceName: clean(body.serviceName, 200),
        serviceNumber: await nextServiceNumber(prisma, tenant),
        serial: clean(body.serial, 100),
        reportedIssue: clean(body.reportedIssue, 2000),
        diagnosis: clean(body.diagnosis, 2000),
        checklist: body.checklist && typeof body.checklist === 'object' && !Array.isArray(body.checklist) ? (body.checklist as Prisma.InputJsonValue) : {},
        technicianId: clean(body.technicianId, 200),
        technicianName: clean(body.technicianName, 200),
        status,
        pricePyg,
        costPyg: costoTotal,
        partsPyg: partsPyg ?? null,
        laborPyg: laborPyg ?? null,
        otherCostPyg: otherCostPyg ?? null,
        notes: clean(body.notes, 2000),
      },
    })
    await prisma.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'SERVICE_ORDER_CREATED', entity: 'ServiceOrder', entityId: created.id, metadata: { device, customerName, status, pricePyg, costPyg: costoTotal, desglose: conDesglose ? { partsPyg: partsPyg ?? 0, laborPyg: laborPyg ?? 0, otherCostPyg: otherCostPyg ?? 0 } : null } } })
    const desbloqueo = leerDesbloqueo(body)
    if (desbloqueo) {
      const secreto = cifrarSecreto(desbloqueo, { uso: USO_DESBLOQUEO, referencia: created.id })
      await prisma.serviceOrder.update({ where: { id: created.id }, data: { unlockSecret: secreto, unlockUpdatedAt: new Date() } })
      await prisma.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'SERVICE_ORDER_UNLOCK_SAVED', entity: 'ServiceOrder', entityId: created.id, metadata: { conPatron: Array.isArray(desbloqueo.patron) && desbloqueo.patron.length > 0 } } })
      return json(conDesbloqueo({ ...created, unlockSecret: secreto }, session.user.role), { status: 201 })
    }
    return json(conDesbloqueo(created, session.user.role), { status: 201 })
  } catch (cause) {
    return error(cause instanceof Error ? cause.message : 'No se pudo crear la orden de servicio.', 400)
  }
}

export async function PATCH(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (!puedeOperar(session.user)) return error('No autorizado.', 403)
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
    const partsPyg = costoOpcional(body.partsPyg)
    const laborPyg = costoOpcional(body.laborPyg)
    const otherCostPyg = costoOpcional(body.otherCostPyg)
    const tocaDesglose = [partsPyg, laborPyg, otherCostPyg].some(valor => valor !== undefined)
    const desglose = {
      partsPyg: partsPyg === undefined ? existing.partsPyg : partsPyg,
      laborPyg: laborPyg === undefined ? existing.laborPyg : laborPyg,
      otherCostPyg: otherCostPyg === undefined ? existing.otherCostPyg : otherCostPyg,
    }
    const costoTotal = usaDesglose(desglose.partsPyg, desglose.laborPyg, desglose.otherCostPyg)
      ? (desglose.partsPyg ?? 0) + (desglose.laborPyg ?? 0) + (desglose.otherCostPyg ?? 0)
      : costPyg
    if (costoTotal !== undefined && !safeInt(costoTotal)) throw new InputError('El costo total supera el máximo permitido.')
    const desbloqueo = leerDesbloqueo(body)
    const secreto = desbloqueo ? cifrarSecreto(desbloqueo, { uso: USO_DESBLOQUEO, referencia: existing.id }) : undefined
    const updated = await prisma.serviceOrder.update({
      where: { id: existing.id },
      data: {
        ...(secreto === undefined ? {} : { unlockSecret: secreto, unlockUpdatedAt: new Date() }),
        ...(status === undefined ? {} : { status }),
        ...(status === 'ENTREGADO' && existing.status !== 'ENTREGADO' ? { deliveredAt: new Date() } : {}),
        ...(pricePyg === undefined ? {} : { pricePyg }),
        ...(tocaDesglose
          ? { partsPyg: desglose.partsPyg, laborPyg: desglose.laborPyg, otherCostPyg: desglose.otherCostPyg, costPyg: costoTotal }
          : costPyg === undefined ? {} : { costPyg }),
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
    return json(conDesbloqueo(updated, session.user.role))
  } catch (cause) {
    return error(cause instanceof Error ? cause.message : 'No se pudo actualizar la orden de servicio.', 400)
  }
}
