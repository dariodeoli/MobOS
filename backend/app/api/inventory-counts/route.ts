import { prisma } from '../../../lib/prisma'
import { canAccessAny, requireSession } from '../../../lib/auth'
import { error, json, tenantId } from '../../../lib/http'
import { InputError, objectInput, textInput } from '../../../lib/payment-input'
import { recomputeStock } from '../../../lib/stock'
import { ensureStoreBranch } from '../../../lib/store-branch'

const MAX_SERIALES = 5000

async function resolveBranch(session: Awaited<ReturnType<typeof requireSession>>, requested: unknown) {
  if (!session) return null
  const candidate = typeof requested === 'string' && requested ? requested : null
  let branchId = session.user.branchId || (session.user.role === 'ADMIN' ? candidate : null)
  if (!branchId) branchId = await ensureStoreBranch(session)
  if (!branchId) return null
  const branch = await prisma.branch.findFirst({ where: { id: branchId, tenantId: session.user.tenantId, isActive: true }, select: { id: true } })
  return branch?.id || null
}

// Conteos físicos: documento auditable por sucursal. El escaneo es incremental
// (guardar y continuar) y la aprobación la resuelve gerencia.
export async function GET(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (!canAccessAny(session.user, ['stock:manage', 'stock:read', 'products:read'])) return error('No autorizado.', 403)
  const params = new URL(request.url).searchParams
  const status = params.get('status')
  const branchId = session.user.branchId || (session.user.role === 'ADMIN' ? params.get('branchId') : null)
  const counts = await prisma.inventoryCount.findMany({
    where: { tenantId: tenant, ...(branchId ? { branchId } : {}), ...(status && ['DRAFT', 'APPLIED', 'CANCELLED'].includes(status) ? { status: status as 'DRAFT' | 'APPLIED' | 'CANCELLED' } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { _count: { select: { lines: true } }, branch: { select: { id: true, name: true } } },
  })
  return json(counts)
}

export async function POST(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (!canAccessAny(session.user, ['stock:manage', 'stock:read'])) return error('No autorizado.', 403)
  try {
    const body = objectInput(await request.json())
    const branchId = await resolveBranch(session, body.branchId)
    if (!branchId) throw new InputError('No hay una sucursal activa para contar.', 409)
    const note = body.note === undefined || body.note === null || body.note === '' ? null : textInput(body.note, 'Nota', 300)
    const count = await prisma.inventoryCount.create({ data: { tenantId: tenant, branchId, note, createdById: session.user.id }, include: { branch: { select: { id: true, name: true } } } })
    await prisma.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'INVENTORY_COUNT_CREATED', entity: 'InventoryCount', entityId: count.id, metadata: { branchId, note } } })
    return json({ ...count, lines: [], _count: { lines: 0 } }, { status: 201 })
  } catch (cause) {
    if (cause instanceof InputError) return error(cause.message, cause.status)
    return error(cause instanceof Error ? cause.message : 'No se pudo iniciar el conteo.', 400)
  }
}

export async function PATCH(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  try {
    const body = objectInput(await request.json())
    const id = textInput(body.id, 'id', 200)
    const action = textInput(body.action, 'Acción', 20)
    const count = await prisma.inventoryCount.findFirst({ where: { id, tenantId: tenant } })
    if (!count) throw new InputError('Conteo no encontrado.', 404)
    if (count.status !== 'DRAFT') throw new InputError('El conteo ya fue aplicado o cancelado.', 409)
    const canManage = canAccessAny(session.user, ['stock:manage'])
    if ((action === 'scan' || action === 'cancel') && !canAccessAny(session.user, ['stock:manage', 'stock:read'])) throw new InputError('No autorizado.', 403)

    if (action === 'scan') {
      const rows = await prisma.inventoryCountLine.count({ where: { countId: count.id } })
      if (rows >= MAX_SERIALES) throw new InputError('El conteo alcanzó el máximo de líneas; aplicalo y empezá otro.', 409)
      const serialRaw = body.serial === undefined || body.serial === null || body.serial === '' ? null : textInput(body.serial, 'Serial', 100).toUpperCase()
      if (serialRaw) {
        const unit = await prisma.inventoryUnit.findFirst({ where: { tenantId: tenant, serial: serialRaw }, select: { productId: true, branchId: true, status: true } })
        const expected = Boolean(unit && unit.branchId === count.branchId && unit.status === 'AVAILABLE')
        const line = await prisma.inventoryCountLine.upsert({
          where: { countId_serial: { countId: count.id, serial: serialRaw } },
          create: { tenantId: tenant, countId: count.id, productId: unit?.productId ?? null, serial: serialRaw, expected, scannedById: session.user.id },
          update: {},
        })
        await prisma.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'INVENTORY_COUNT_SCANNED', entity: 'InventoryCount', entityId: count.id, metadata: { serial: serialRaw, expected, productId: unit?.productId ?? null } } })
        return json({ ...line, expected })
      }
      const productId = textInput(body.productId, 'productId', 200)
      const quantity = Number(body.quantity ?? 1)
      if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000000) throw new InputError('Cantidad inválida.')
      const product = await prisma.product.findFirst({ where: { id: productId, tenantId: tenant }, select: { id: true } })
      if (!product) throw new InputError('Producto no encontrado.', 404)
      const existing = await prisma.inventoryCountLine.findFirst({ where: { countId: count.id, productId, serial: null } })
      const line = existing
        ? await prisma.inventoryCountLine.update({ where: { id: existing.id }, data: { quantity: existing.quantity + quantity } })
        : await prisma.inventoryCountLine.create({ data: { tenantId: tenant, countId: count.id, productId, quantity, expected: false, scannedById: session.user.id } })
      await prisma.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'INVENTORY_COUNT_SCANNED', entity: 'InventoryCount', entityId: count.id, metadata: { productId, quantity } } })
      return json(line)
    }

    if (action === 'cancel') {
      if (count.createdById !== session.user.id && !canManage) throw new InputError('Solo quien inició el conteo o gerencia pueden cancelarlo.', 403)
      const cancelled = await prisma.inventoryCount.update({ where: { id: count.id }, data: { status: 'CANCELLED' } })
      await prisma.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'INVENTORY_COUNT_CANCELLED', entity: 'InventoryCount', entityId: count.id, metadata: {} } })
      return json(cancelled)
    }

    if (action === 'apply') {
      if (!canManage) throw new InputError('Solo administración o gerencia aprueban un conteo.', 403)
      const adjust = body.adjust !== false
      const result = await prisma.$transaction(async tx => {
        const lines = await tx.inventoryCountLine.findMany({ where: { countId: count.id } })
        const scanned = new Set(lines.filter(line => line.serial).map(line => line.serial as string))
        const expectedUnits = await tx.inventoryUnit.findMany({ where: { tenantId: tenant, branchId: count.branchId, status: 'AVAILABLE' }, select: { id: true, serial: true, productId: true } })
        const missing = expectedUnits.filter(unit => !scanned.has(unit.serial))
        // Lo escaneado que no estaba disponible en la sucursal queda registrado
        // como diferencia, pero no revive stock por sí solo.
        const unexpected = lines.filter(line => line.serial && !line.expected)
        if (adjust && missing.length) {
          await tx.inventoryUnit.updateMany({ where: { id: { in: missing.map(unit => unit.id) }, tenantId: tenant, status: 'AVAILABLE' }, data: { status: 'DEFECTIVE' } })
          for (const productId of new Set(missing.map(unit => unit.productId))) await recomputeStock(tx, tenant, productId)
          for (const unit of missing) {
            await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'INVENTORY_UNIT_ADJUSTED', entity: 'InventoryUnit', entityId: unit.id, metadata: { reason: 'COUNT_MISSING', serial: unit.serial, countId: count.id } } })
          }
        }
        const applied = await tx.inventoryCount.update({ where: { id: count.id }, data: { status: 'APPLIED', appliedById: session.user.id, appliedAt: new Date() } })
        await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'INVENTORY_COUNT_APPLIED', entity: 'InventoryCount', entityId: count.id, metadata: { branchId: count.branchId, expected: expectedUnits.length, counted: scanned.size, missing: missing.length, unexpected: unexpected.length, adjust } } })
        return { applied, expected: expectedUnits.length, counted: scanned.size, missing: missing.length, unexpected: unexpected.length, adjust }
      })
      return json(result)
    }

    throw new InputError('Acción de conteo inválida.')
  } catch (cause) {
    if (cause instanceof InputError) return error(cause.message, cause.status)
    return error(cause instanceof Error ? cause.message : 'No se pudo actualizar el conteo.', 400)
  }
}
