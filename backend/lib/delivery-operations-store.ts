import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { effectivePermissions } from './auth'
import { branchScope, type DeliveryActor } from './delivery-access'
import { InputError, objectInput, textInput } from './payment-input'
import { numero } from './montos'
import { dayInput, dayKey, fields, integerPyg, keyInput, localDay, parseTariff, plusDays, quoteTrip, reasonInput, sumPyg, weekInput, weekOf, weeklyAmounts, type CollectionRow, type TariffTier } from './delivery-operations'

type Tx = Prisma.TransactionClient
function ownerRequired(actor: DeliveryActor) { if (!actor.owner) throw new InputError('Solo el dueño puede realizar esta acción.', 403) }
const person = { select: { id: true, name: true } } as const
export const tripInclude = { driver: person, branch: person, order: { select: { id: true, orderNumber: true, status: true } }, resolvedBy: person } as const
const closeInclude = { driver: person, branch: person, createdBy: person, adjustments: { include: { createdBy: person }, orderBy: { createdAt: 'asc' as const } } } as const
const closeKey = (tenant: string, branch: string, driver: string, week: Date) => `${tenant}:${branch}:${driver}:${dayKey(week)}`
async function lock(tx: Tx, key: string) { await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`delivery:${key}`}, 0))` }
export function weeklyLock(tx: Tx, tenant: string, branch: string, driver: string, week: Date) { return lock(tx, closeKey(tenant, branch, driver, week)) }
async function branchAndDriver(tx: Tx, actor: DeliveryActor, branchId: string, driverId: string, activeOnly = true) {
  branchScope(actor, branchId)
  if (actor.driverOnly && driverId !== actor.userId) throw new InputError('Solo podés registrar tus viajes.', 403)
  const [branch, driver] = await Promise.all([
    tx.branch.findFirst({ where: { id: branchId, tenantId: actor.tenantId, ...(activeOnly ? { isActive: true } : {}) }, select: { id: true } }),
    tx.user.findFirst({ where: { id: driverId, tenantId: actor.tenantId, ...(activeOnly ? { status: 'ACTIVE' as const } : {}) }, select: { id: true, role: true, permissions: true, branchId: true } }),
  ])
  if (!branch || !driver || (activeOnly && (!effectivePermissions(driver.role, driver.permissions).some(p => p === '*' || p === 'delivery:use') || (driver.branchId && driver.branchId !== branchId)))) throw new InputError('Sucursal o repartidor inválido.', 404)
}
async function orderInScope(tx: Tx, actor: DeliveryActor, branchId: string, orderId: string) {
  const order = await tx.order.findFirst({ where: { id: orderId, tenantId: actor.tenantId, branchId }, select: { id: true, status: true, sellerId: true, assignedToId: true } })
  if (!order || order.status === 'CANCELLED') throw new InputError('Pedido no disponible en esta sucursal.', 404)
  if (!actor.owner && ((actor.driverOnly && order.assignedToId !== actor.userId) || (actor.user.role === 'VENDEDOR' && order.sellerId !== actor.userId))) throw new InputError('Pedido fuera de tu alcance.', 403)
  return order
}
export async function saveTariff(actor: DeliveryActor, input: unknown) {
  ownerRequired(actor)
  const parsed = parseTariff(input)
  return prisma.$transaction(async tx => {
    await lock(tx, `${actor.tenantId}:tariffs`)
    const overlap = await tx.deliveryTariff.findFirst({ where: { tenantId: actor.tenantId, isActive: true, validFrom: { lte: parsed.validUntil }, validUntil: { gte: parsed.validFrom } } })
    if (overlap) throw new InputError('La vigencia se superpone con una tarifa activa. Desactivá la versión anterior con motivo.', 409)
    const tariff = await tx.deliveryTariff.create({ data: { ...parsed, tenantId: actor.tenantId, createdById: actor.userId } })
    await tx.auditLog.create({ data: { tenantId: actor.tenantId, userId: actor.userId, action: 'DELIVERY_TARIFF_CREATED', entity: 'DeliveryTariff', entityId: tariff.id, metadata: { name: parsed.name, validFrom: dayKey(parsed.validFrom), validUntil: dayKey(parsed.validUntil), tiers: parsed.tiers } } })
    return tariff
  })
}
export async function deactivateTariff(actor: DeliveryActor, id: string, input: unknown) {
  ownerRequired(actor)
  const body = objectInput(input); fields(body, ['reason']); const reason = reasonInput(body.reason)
  return prisma.$transaction(async tx => {
    await lock(tx, `${actor.tenantId}:tariffs`)
    const tariff = await tx.deliveryTariff.findFirst({ where: { id, tenantId: actor.tenantId } })
    if (!tariff) throw new InputError('Tarifa no encontrada.', 404)
    if (!tariff.isActive) return tariff
    await tx.deliveryTariff.update({ where: { id }, data: { isActive: false } })
    await tx.auditLog.create({ data: { tenantId: actor.tenantId, userId: actor.userId, action: 'DELIVERY_TARIFF_DEACTIVATED', entity: 'DeliveryTariff', entityId: id, metadata: { reason } } })
    return { ...tariff, isActive: false }
  })
}
export async function createTrip(actor: DeliveryActor, input: unknown) {
  const body = objectInput(input); fields(body, ['branchId', 'driverId', 'orderId', 'route', 'distanceKm', 'tripsCount', 'performedOn', 'idempotencyKey'])
  const branchId = textInput(body.branchId, 'Sucursal', 100), driverId = textInput(body.driverId, 'Repartidor', 100)
  const orderId = body.orderId === null || body.orderId === '' || body.orderId === undefined ? null : textInput(body.orderId, 'Pedido', 100)
  const route = textInput(body.route, 'Ruta o línea', 200), performedOn = dayInput(body.performedOn), idempotencyKey = keyInput(body.idempotencyKey)
  if (dayKey(performedOn) > localDay(new Date())) throw new InputError('Registrá viajes realizados, no fechas futuras.')
  // Validación de distancia/cantidad también antes de buscar una operación repetida.
  const shape = quoteTrip([{ upToKm: 28, feePyg: 0 }], body.distanceKm, body.tripsCount)
  return prisma.$transaction(async tx => {
    await branchAndDriver(tx, actor, branchId, driverId)
    await weeklyLock(tx, actor.tenantId, branchId, driverId, weekOf(performedOn))
    const existing = await tx.deliveryTrip.findUnique({ where: { tenantId_idempotencyKey: { tenantId: actor.tenantId, idempotencyKey } }, include: tripInclude })
    if (existing) {
      if (existing.branchId !== branchId || existing.driverId !== driverId || existing.orderId !== orderId || existing.route !== route || existing.distanceMeters !== shape.distanceMeters || existing.tripsCount !== shape.tripsCount || dayKey(existing.performedOn) !== dayKey(performedOn)) throw new InputError('La clave ya corresponde a otro viaje.', 409)
      if (!actor.owner && existing.createdById !== actor.userId) throw new InputError('Operación fuera de tu alcance.', 403)
      return existing
    }
    if (await tx.deliveryWeeklyClose.findUnique({ where: { tenantId_branchId_driverId_weekStart: { tenantId: actor.tenantId, branchId, driverId, weekStart: weekOf(performedOn) } } })) throw new InputError('La semana ya está cerrada; registrá una corrección con motivo.', 409)
    if (orderId) await orderInScope(tx, actor, branchId, orderId)
    // Usa el mismo candado de la configuración para no cotizar contra una versión que se desactiva.
    await lock(tx, `${actor.tenantId}:tariffs`)
    const tariff = await tx.deliveryTariff.findFirst({ where: { tenantId: actor.tenantId, isActive: true, validFrom: { lte: performedOn }, validUntil: { gte: performedOn } } })
    if (!tariff) throw new InputError('No hay tarifa activa para esa fecha. El dueño debe guardar los honorarios antes de registrar viajes.', 409)
    const quote = quoteTrip(tariff.tiers as TariffTier[], body.distanceKm, body.tripsCount)
    const trip = await tx.deliveryTrip.create({ data: { tenantId: actor.tenantId, branchId, driverId, orderId, route, performedOn, idempotencyKey, ...quote, tariffId: tariff.id, tariffSnapshot: { id: tariff.id, name: tariff.name, validFrom: dayKey(tariff.validFrom), validUntil: dayKey(tariff.validUntil), tiers: tariff.tiers }, createdById: actor.userId }, include: tripInclude })
    await tx.auditLog.create({ data: { tenantId: actor.tenantId, userId: actor.userId, action: 'DELIVERY_TRIP_RECORDED', entity: 'DeliveryTrip', entityId: trip.id, metadata: { branchId, driverId, orderId, route, performedOn: dayKey(performedOn), ...quote, tariffId: tariff.id } } })
    return trip
  }, { timeout: 15000 })
}
export async function resolveTrip(actor: DeliveryActor, id: string, input: unknown) {
  ownerRequired(actor)
  const body = objectInput(input); fields(body, ['action', 'orderId', 'reason'])
  if (body.action !== 'link' && body.action !== 'discard') throw new InputError('Elegí vincular o descartar.')
  const reason = reasonInput(body.reason)
  const action = body.action
  return prisma.$transaction(async tx => {
    const trip = await tx.deliveryTrip.findFirst({ where: { id, tenantId: actor.tenantId } })
    if (!trip) throw new InputError('Viaje no encontrado.', 404)
    branchScope(actor, trip.branchId)
    await weeklyLock(tx, actor.tenantId, trip.branchId, trip.driverId, weekOf(trip.performedOn))
    const current = await tx.deliveryTrip.findFirstOrThrow({ where: { id, tenantId: actor.tenantId } })
    if (current.weeklyCloseId || current.status !== 'COMPLETED' || current.orderId) throw new InputError('El viaje ya está resuelto o cerrado.', 409)
    const orderId = action === 'link' ? textInput(body.orderId, 'Pedido', 100) : null
    if (orderId) await orderInScope(tx, actor, current.branchId, orderId)
    const updated = await tx.deliveryTrip.update({ where: { id }, data: { orderId, status: action === 'discard' ? 'CANCELLED' : 'COMPLETED', resolutionNote: reason, resolvedById: actor.userId, resolvedAt: new Date() }, include: tripInclude })
    await tx.auditLog.create({ data: { tenantId: actor.tenantId, userId: actor.userId, action: action === 'link' ? 'DELIVERY_TRIP_LINKED' : 'DELIVERY_TRIP_DISCARDED', entity: 'DeliveryTrip', entityId: id, metadata: { orderId, reason, previousOrderId: current.orderId } } })
    return updated
  })
}
async function weekRows(tx: Tx, actor: DeliveryActor, branchId: string, driverId: string, weekStart: Date) {
  await branchAndDriver(tx, actor, branchId, driverId, false)
  const end = plusDays(weekStart, 7)
  const [trips, broadPayments] = await Promise.all([
    tx.deliveryTrip.findMany({ where: { tenantId: actor.tenantId, branchId, driverId, performedOn: { gte: weekStart, lt: end }, status: 'COMPLETED' }, include: tripInclude, orderBy: { performedOn: 'asc' }, take: 5001 }),
    tx.payment.findMany({ where: { tenantId: actor.tenantId, deliveryUserId: driverId, order: { branchId }, OR: [{ collectedAt: { gte: plusDays(weekStart, -1), lt: plusDays(end, 1) } }, { collectedAt: null, createdAt: { gte: plusDays(weekStart, -1), lt: plusDays(end, 1) } }] }, select: { id: true, amountPyg: true, status: true, method: true, orderId: true, collectedAt: true, createdAt: true, deliverySettlementId: true }, take: 5001 }),
  ])
  if (trips.length > 5000 || broadPayments.length > 5000) throw new InputError('La semana supera el límite de filas; pedí revisión antes de cerrar.', 409)
  const payments = broadPayments.filter(row => { const day = localDay(row.collectedAt || row.createdAt); return day >= dayKey(weekStart) && day < dayKey(end) })
  const feesPyg = sumPyg(trips.map(row => row.totalFeePyg))
  return { trips, payments, amounts: weeklyAmounts(feesPyg, payments), unresolvedCount: trips.filter(row => !row.orderId).length }
}
async function viewClose(tx: Tx, id: string, tenantId: string) {
  const close = await tx.deliveryWeeklyClose.findFirstOrThrow({ where: { id, tenantId }, include: closeInclude })
  const snapshot = close.snapshot as unknown as { collections: Array<CollectionRow & { amountPyg: number }> }
  const ids = snapshot.collections.map(row => row.id)
  const current = await tx.payment.findMany({ where: { tenantId, id: { in: ids }, deliveryUserId: close.driverId, order: { branchId: close.branchId } }, select: { id: true, amountPyg: true, status: true, deliverySettlementId: true, method: true, orderId: true } })
  const currentById = new Map(current.map(row => [row.id, row]))
  // Una eliminación externa no perdona deuda silenciosamente: conserva la foto y avisa.
  const collections = snapshot.collections.map(row => currentById.get(row.id) || { ...row, missing: true })
  return { ...close, collections, missingPaymentIds: ids.filter(id => !currentById.has(id)), current: weeklyAmounts(close.feesPyg, collections, close.adjustments.map(row => row.deltaPyg)) }
}
export async function weeklyView(actor: DeliveryActor, branchId: string, driverId: string, weekStart: Date) {
  ownerRequired(actor)
  return prisma.$transaction(async tx => {
    const preview = await weekRows(tx, actor, branchId, driverId, weekStart)
    const close = await tx.deliveryWeeklyClose.findUnique({ where: { tenantId_branchId_driverId_weekStart: { tenantId: actor.tenantId, branchId, driverId, weekStart } }, select: { id: true } })
    return { ...preview, close: close ? await viewClose(tx, close.id, actor.tenantId) : null }
  })
}
export async function closeWeek(actor: DeliveryActor, input: unknown) {
  ownerRequired(actor)
  const body = objectInput(input); fields(body, ['branchId', 'driverId', 'weekStart'])
  const branchId = textInput(body.branchId, 'Sucursal', 100), driverId = textInput(body.driverId, 'Repartidor', 100), weekStart = weekInput(body.weekStart)
  if (dayKey(plusDays(weekStart, 7)) > localDay(new Date())) throw new InputError('Solo se pueden cerrar semanas terminadas.')
  return prisma.$transaction(async tx => {
    await branchAndDriver(tx, actor, branchId, driverId, false)
    await weeklyLock(tx, actor.tenantId, branchId, driverId, weekStart)
    const existing = await tx.deliveryWeeklyClose.findUnique({ where: { tenantId_branchId_driverId_weekStart: { tenantId: actor.tenantId, branchId, driverId, weekStart } }, select: { id: true } })
    if (existing) return viewClose(tx, existing.id, actor.tenantId)
    const rows = await weekRows(tx, actor, branchId, driverId, weekStart)
    if (rows.unresolvedCount) throw new InputError('Resolvé primero los viajes sin venta: vinculalos o descartalos con motivo.', 409)
    if (!rows.trips.length && !rows.payments.length) throw new InputError('No hay viajes ni cobros para cerrar.', 409)
    const a = rows.amounts
    const snapshot = { trips: rows.trips.map(row => ({ id: row.id, orderId: row.orderId, route: row.route, tripsCount: row.tripsCount, totalFeePyg: numero(row.totalFeePyg), tariffSnapshot: row.tariffSnapshot })), collections: rows.payments.map(row => ({ id: row.id, orderId: row.orderId, amountPyg: numero(row.amountPyg), status: row.status, method: row.method, deliverySettlementId: row.deliverySettlementId })) }
    const close = await tx.deliveryWeeklyClose.create({ data: { tenantId: actor.tenantId, branchId, driverId, weekStart, feesPyg: a.feesPyg, collectedPyg: a.collectedPyg, renderedPyg: a.renderedPyg, balanceAtClosePyg: a.balancePyg, snapshot, createdById: actor.userId } })
    await tx.deliveryTrip.updateMany({ where: { tenantId: actor.tenantId, id: { in: rows.trips.map(row => row.id) }, weeklyCloseId: null }, data: { weeklyCloseId: close.id } })
    await tx.auditLog.create({ data: { tenantId: actor.tenantId, userId: actor.userId, action: 'DELIVERY_WEEK_CLOSED', entity: 'DeliveryWeeklyClose', entityId: close.id, metadata: { branchId, driverId, weekStart: dayKey(weekStart), ...a, trips: rows.trips.length, collections: rows.payments.length } } })
    return viewClose(tx, close.id, actor.tenantId)
  }, { timeout: 15000 })
}
export async function adjustWeek(actor: DeliveryActor, id: string, input: unknown) {
  ownerRequired(actor)
  const body = objectInput(input); fields(body, ['deltaPyg', 'reason', 'idempotencyKey'])
  const deltaPyg = integerPyg(body.deltaPyg, 'Ajuste', true), reason = reasonInput(body.reason), idempotencyKey = keyInput(body.idempotencyKey)
  if (!deltaPyg) throw new InputError('El ajuste debe ser distinto de cero.')
  return prisma.$transaction(async tx => {
    const close = await tx.deliveryWeeklyClose.findFirst({ where: { id, tenantId: actor.tenantId } })
    if (!close) throw new InputError('Cierre no encontrado.', 404)
    branchScope(actor, close.branchId)
    await weeklyLock(tx, actor.tenantId, close.branchId, close.driverId, close.weekStart)
    const existing = await tx.deliveryWeeklyAdjustment.findUnique({ where: { tenantId_idempotencyKey: { tenantId: actor.tenantId, idempotencyKey } } })
    if (existing) {
      if (existing.weeklyCloseId !== id || numero(existing.deltaPyg) !== deltaPyg || existing.reason !== reason) throw new InputError('La clave ya corresponde a otro ajuste.', 409)
      return viewClose(tx, id, actor.tenantId)
    }
    const current = await viewClose(tx, id, actor.tenantId)
    sumPyg([current.current.balancePyg, deltaPyg])
    const adjustment = await tx.deliveryWeeklyAdjustment.create({ data: { tenantId: actor.tenantId, weeklyCloseId: id, deltaPyg, reason, idempotencyKey, createdById: actor.userId } })
    await tx.auditLog.create({ data: { tenantId: actor.tenantId, userId: actor.userId, action: 'DELIVERY_WEEK_ADJUSTED', entity: 'DeliveryWeeklyClose', entityId: id, metadata: { adjustmentId: adjustment.id, deltaPyg, reason, balanceBeforePyg: current.current.balancePyg, balanceAfterPyg: sumPyg([current.current.balancePyg, deltaPyg]) } } })
    return viewClose(tx, id, actor.tenantId)
  })
}
