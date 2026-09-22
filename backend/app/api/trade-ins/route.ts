import { Prisma, type TradeInStatus, type ProductDestination } from '@prisma/client'
import { prisma } from '../../../lib/prisma'
import { requireSession } from '../../../lib/auth'
import { error, json } from '../../../lib/http'
import { InputError, INT_MAX, objectInput, textInput } from '../../../lib/payment-input'

const transitions: Record<TradeInStatus, TradeInStatus[]> = {
  RECEIVED: ['REVIEW'], REVIEW: ['REPAIR', 'READY', 'SOLD_EXTERNAL'], REPAIR: ['READY'],
  READY: ['REPAIR', 'STOCK', 'SOLD_EXTERNAL'], STOCK: [], SOLD_EXTERNAL: [],
}
const canManage = (role: string) => role === 'ADMIN' || role === 'GERENTE'
const textOrNull = (value: unknown, field: string, limit = 2000) => {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  if (typeof value !== 'string' || value.trim().length > limit) throw new InputError(`${field} debe ser texto de hasta ${limit} caracteres.`)
  return value.trim() || null
}
const stringList = (value: unknown, field: string) => {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.length > 20 || value.some(item => typeof item !== 'string' || item.trim().length === 0 || item.length > 500)) throw new InputError(`${field} debe ser una lista de hasta 20 textos.`)
  return value.map(item => item.trim())
}
function includeRelations(admin: boolean): Prisma.TradeInDeviceInclude {
  return {
    order: { select: { id: true, orderNumber: true, customer: { select: { id: true, name: true, phone: true } } } },
    payment: { select: { id: true, amountPyg: true, currency: true, originalAmount: true, exchangeRatePyg: true, paidAt: true } },
    product: { select: { id: true, name: true, sku: true, imei: true, stock: true, pricePyg: true, destination: true,
      ...(admin ? { orderItems: { select: { quantity: true, unitPricePyg: true, totalPyg: true,
        order: { select: { id: true, orderNumber: true, status: true, createdAt: true,
          customer: { select: { id: true, name: true } }, seller: { select: { id: true, name: true } } } } } } } : {}) } },
  }
}

export async function GET(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!canManage(session.user.role)) return error('No autorizado.', 403)
  const admin = session.user.role === 'ADMIN'
  const query = new URL(request.url).searchParams
  const status = query.get('status')
  if (status && !Object.hasOwn(transitions, status)) return error('Estado inválido.')
  const q = query.get('q')?.trim()
  const devices = await prisma.tradeInDevice.findMany({ where: {
    tenantId: session.user.tenantId, ...(admin ? {} : { branchId: session.user.branchId }),
    ...(status ? { status: status as TradeInStatus } : {}),
    ...(q ? { OR: [{ serial: { contains: q, mode: 'insensitive' } }, { model: { contains: q, mode: 'insensitive' } }] } : {}),
  }, include: includeRelations(admin), orderBy: { createdAt: 'desc' }, take: 100 })
  const events = devices.length ? await prisma.auditLog.findMany({
    where: { tenantId: session.user.tenantId, entity: 'TradeInDevice', entityId: { in: devices.map(device => device.id) } },
    select: { id: true, entityId: true, action: true, metadata: true, createdAt: true, user: { select: { id: true, name: true } } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  }) : []
  const history = new Map<string, typeof events>()
  for (const event of events) {
    if (!event.entityId) continue
    const entries = history.get(event.entityId) ?? []
    entries.push(event)
    history.set(event.entityId, entries)
  }
  return json(devices.map(device => ({ ...device, history: history.get(device.id) ?? [] })))
}

export async function PATCH(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!canManage(session.user.role)) return error('No autorizado.', 403)
  const tenantId = session.user.tenantId; const admin = session.user.role === 'ADMIN'
  try {
    const body = objectInput(await request.json())
    const id = textInput(body.id, 'id', 200)
    const notes = body.notes === undefined ? undefined : textInput(body.notes, 'notes')
    const diagnosis = textOrNull(body.diagnosis, 'diagnosis')
    const technicianName = textOrNull(body.technicianName, 'technicianName', 200)
    const accessories = stringList(body.accessories, 'accessories')
    const photos = stringList(body.photos, 'photos')
    const increment = body.repairCostPyg === undefined ? 0 : body.repairCostPyg
    if (!Number.isSafeInteger(increment) || Number(increment) < 0 || Number(increment) > INT_MAX || (body.repairCostPyg !== undefined && increment === 0)) throw new InputError('repairCostPyg debe ser un incremento entero positivo.')
    const result = await prisma.$transaction(async tx => {
      if (admin) await tx.$queryRaw`SELECT "id" FROM "TradeInDevice" WHERE "id" = ${id} AND "tenantId" = ${tenantId} FOR UPDATE`
      else await tx.$queryRaw`SELECT "id" FROM "TradeInDevice" WHERE "id" = ${id} AND "tenantId" = ${tenantId} AND "branchId" IS NOT DISTINCT FROM ${session.user.branchId}::text FOR UPDATE`
      const current = await tx.tradeInDevice.findFirst({ where: { id, tenantId, ...(admin ? {} : { branchId: session.user.branchId }) } })
      if (!current) throw new InputError('Equipo no encontrado.', 404)
      const next = (body.status ?? current.status) as TradeInStatus
      if (!Object.hasOwn(transitions, next) || (body.status !== undefined && !transitions[current.status].includes(next))) throw new InputError('Transición de trade-in no permitida.', 409)
      if (current.status === 'STOCK' || current.status === 'SOLD_EXTERNAL') throw new InputError('El equipo ya tiene una salida registrada.', 409)
      if (!body.status && notes === undefined && !increment && diagnosis === undefined && technicianName === undefined && accessories === undefined && photos === undefined) throw new InputError('Faltan cambios.')
      if (increment && current.status !== 'REPAIR' && next !== 'REPAIR') throw new InputError('Los costos se registran durante reparación.', 409)
      const repairCostPyg = current.repairCostPyg + Number(increment)
      if (!Number.isSafeInteger(repairCostPyg) || repairCostPyg > INT_MAX) throw new InputError('Costo acumulado fuera de rango.')
      // Costo real del equipo para margen y seguro (#148 §19): lo que se pagó
      // por la valuación + las reparaciones acumuladas. Se congela en el
      // producto al publicarlo; si no, la venta queda con costo pendiente.
      const costoEquipoPyg = current.valuePyg + repairCostPyg
      if (!Number.isSafeInteger(costoEquipoPyg) || costoEquipoPyg > INT_MAX) throw new InputError('El costo del equipo (valor + reparaciones) supera el máximo permitido.')
      if (next === 'SOLD_EXTERNAL' && !notes) throw new InputError('Indique destino y contraparte en notes para la salida externa.')
      if (next !== 'STOCK' && (body.pricePyg !== undefined || body.destination !== undefined)) throw new InputError('Precio y destino corresponden a la publicación STOCK.')
      let productId: string | undefined
      if (next === 'STOCK') {
        if (current.productId) throw new InputError('El equipo ya fue publicado.', 409)
        if (!Number.isSafeInteger(body.pricePyg) || Number(body.pricePyg) <= 0 || Number(body.pricePyg) > INT_MAX) throw new InputError('pricePyg debe ser un entero positivo.')
        if (!['NORMAL', 'OFFER', 'WHOLESALE'].includes(body.destination as string)) throw new InputError('destination debe ser NORMAL, OFFER o WHOLESALE.')
        if (current.branchId && !await tx.branch.findFirst({ where: { id: current.branchId, tenantId, isActive: true } })) throw new InputError('Sucursal inactiva.', 409)
        const duplicate = await tx.product.findFirst({ where: { tenantId, imei: { equals: current.serial, mode: 'insensitive' } } })
        if (duplicate) throw new InputError('Ya existe un producto con ese serial.', 409)
        const product = await tx.product.create({ data: { tenantId, branchId: current.branchId, sku: `TRADE-IN-${current.id}`, name: current.model,
          imei: current.serial, condition: 'USED', stock: 1, pricePyg: Number(body.pricePyg), costPyg: costoEquipoPyg, destination: body.destination as ProductDestination } })
        productId = product.id
      }
      const updated = await tx.tradeInDevice.update({ where: { id }, data: { status: next, notes, productId, ...(diagnosis !== undefined ? { diagnosis } : {}), ...(technicianName !== undefined ? { technicianName } : {}), ...(accessories !== undefined ? { accessories } : {}), ...(photos !== undefined ? { photos } : {}), ...(increment ? { repairCostPyg: { increment: Number(increment) } } : {}) }, include: includeRelations(admin) })
      if (increment) await tx.auditLog.create({ data: { tenantId, userId: session.user.id, action: 'TRADE_IN_REPAIR_COST_ADDED', entity: 'TradeInDevice', entityId: id,
        metadata: { incrementPyg: Number(increment), beforePyg: current.repairCostPyg, afterPyg: repairCostPyg, notes: notes ?? null } } })
      await tx.auditLog.create({ data: { tenantId, userId: session.user.id, action: next === 'STOCK' ? 'TRADE_IN_PUBLISHED' : next === 'SOLD_EXTERNAL' ? 'TRADE_IN_SOLD_EXTERNAL' : 'TRADE_IN_UPDATED', entity: 'TradeInDevice', entityId: id,
        metadata: { from: current.status, to: next, notes: notes ?? null, previousNotes: current.notes, productId: productId ?? null,
          ...(next === 'STOCK' ? { pricePyg: Number(body.pricePyg), destination: body.destination as string, costPyg: costoEquipoPyg } : {}), ...(diagnosis !== undefined ? { diagnosis } : {}), ...(technicianName !== undefined ? { technicianName } : {}), ...(accessories !== undefined ? { accessoriesCount: accessories.length } : {}), ...(photos !== undefined ? { photosCount: photos.length } : {}) } } })
      return updated
    })
    return json(result)
  } catch (e) { return error(e instanceof Error ? e.message : 'No se pudo actualizar el equipo.', e instanceof InputError ? e.status : e instanceof SyntaxError ? 400 : 409) }
}
