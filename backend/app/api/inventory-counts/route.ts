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

export async function GET(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (!canAccessAny(session.user, ['stock:manage', 'stock:read', 'products:read'])) return error('No autorizado.', 403)
  const params = new URL(request.url).searchParams
  const status = params.get('status')
  const branchId = session.user.branchId || (session.user.role === 'ADMIN' ? params.get('branchId') : null)
  const counts = await prisma.inventoryCount.findMany({
    where: { tenantId: tenant, ...(branchId ? { branchId } : {}), ...(status && ['DRAFT', 'APPLIED', 'CANCELLED'].includes(status) ? { status: status as 'DRAFT' | 'APPLIED' | 'CANCELLED' } : {}) },
    orderBy: { createdAt: 'desc' }, take: 50,
    include: { _count: { select: { lines: true } }, branch: { select: { id: true, name: true } }, location: { select: { id: true, name: true } } },
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
    const scopeRaw = body.scope === undefined ? 'PARTIAL' : body.scope
    if (scopeRaw !== 'FULL' && scopeRaw !== 'PARTIAL') throw new InputError('Alcance inválido.')
    const scope = scopeRaw
    const locationId = body.locationId === undefined || body.locationId === null || body.locationId === '' ? null : textInput(body.locationId, 'locationId', 200)
    if (locationId && !(await prisma.stockLocation.findFirst({ where: { id: locationId, tenantId: tenant, branchId, isActive: true }, select: { id: true } }))) throw new InputError('Ubicación no encontrada para esa sucursal.', 404)
    const note = body.note === undefined || body.note === null || body.note === '' ? null : textInput(body.note, 'Nota', 300)
    const count = await prisma.$transaction(async tx => {
      const stockRows = locationId ? [] : await tx.product.findMany({ where: { tenantId: tenant, branchId, isActive: true, NOT: { stockKind: 'EQUIPO' } }, select: { id: true, stock: true } })
      const stockSnapshot = Object.fromEntries(stockRows.map(row => [row.id, row.stock]))
      const serialRows = await tx.inventoryUnit.findMany({ where: { tenantId: tenant, branchId, status: 'AVAILABLE', ...(locationId ? { locationId } : {}) }, take: 50001, select: { id: true, serial: true, productId: true } })
      if (serialRows.length > 50000) throw new InputError('La sucursal supera el límite seguro de unidades para un solo conteo.', 409)
      const serialSnapshot = serialRows.map(({ id, serial, productId }) => ({ id, serial, productId }))
      const created = await tx.inventoryCount.create({ data: { tenantId: tenant, branchId, locationId, scope, note, stockSnapshot, serialSnapshot, createdById: session.user.id }, include: { branch: { select: { id: true, name: true } }, location: { select: { id: true, name: true } } } })
      await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'INVENTORY_COUNT_CREATED', entity: 'InventoryCount', entityId: created.id, metadata: { branchId, locationId, scope, note, stockSnapshotProducts: stockRows.length, serialSnapshotUnits: serialRows.length } } })
      return created
    })
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
    const canManage = canAccessAny(session.user, ['stock:manage'])
    if (action === 'apply' && !canManage) throw new InputError('Solo administración o gerencia aprueban un conteo.', 403)
    if (count.status === 'APPLIED' && action === 'apply') {
      const appliedResult = count.applyResult && typeof count.applyResult === 'object' && !Array.isArray(count.applyResult)
        ? count.applyResult as Record<string, unknown>
        : { idempotentReplay: true }
      return json({ ...appliedResult, applied: count })
    }
    if (count.status !== 'DRAFT') throw new InputError('El conteo ya fue aplicado o cancelado.', 409)
    if ((action === 'scan' || action === 'cancel') && !canAccessAny(session.user, ['stock:manage', 'stock:read'])) throw new InputError('No autorizado.', 403)

    if (action === 'scan') {
      const rows = await prisma.inventoryCountLine.count({ where: { countId: count.id } })
      if (rows >= MAX_SERIALES) throw new InputError('El conteo alcanzó el máximo de líneas; aplicalo y empezá otro.', 409)
      const serialRaw = body.serial === undefined || body.serial === null || body.serial === '' ? null : textInput(body.serial, 'Serial', 100).toUpperCase()
      if (serialRaw) {
        const unit = await prisma.inventoryUnit.findFirst({ where: { tenantId: tenant, serial: serialRaw }, select: { productId: true, branchId: true, locationId: true, status: true } })
        const serialSnapshot = Array.isArray(count.serialSnapshot) ? count.serialSnapshot as Array<{ id: string; serial: string; productId: string }> : []
        const wasExpected = serialSnapshot.some(item => item.serial === serialRaw)
        const expected = Boolean(unit && wasExpected && unit.branchId === count.branchId && (!count.locationId || unit.locationId === count.locationId) && unit.status === 'AVAILABLE')
        const line = await prisma.inventoryCountLine.upsert({
          where: { countId_serial: { countId: count.id, serial: serialRaw } },
          create: { tenantId: tenant, countId: count.id, productId: unit?.productId ?? null, serial: serialRaw, expected, scannedById: session.user.id }, update: {},
        })
        await prisma.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'INVENTORY_COUNT_SCANNED', entity: 'InventoryCount', entityId: count.id, metadata: { serial: serialRaw, expected, productId: unit?.productId ?? null, locationId: unit?.locationId ?? null } } })
        return json({ ...line, expected })
      }
      // Cantidades sin serie: el modelo de saldo existente es por sucursal. No
      // se permite registrar cantidades bajo un sector porque no existe aún un
      // saldo por ubicación que se mantenga sincronizado con ventas/recepciones.
      if (count.locationId) throw new InputError('El conteo por ubicación admite por ahora unidades serializadas; el saldo de productos por cantidad aún es por sucursal.', 409)
      const productId = textInput(body.productId, 'productId', 200)
      const quantity = Number(body.quantity ?? 1)
      if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000000) throw new InputError('Cantidad inválida.')
      const product = await prisma.product.findFirst({ where: { id: productId, tenantId: tenant, branchId: count.branchId }, select: { id: true, stockKind: true } })
      if (!product) throw new InputError('Producto no encontrado en la sucursal.', 404)
      if (product.stockKind === 'EQUIPO') throw new InputError('Los productos serializados deben contarse por serie.')
      const existing = await prisma.inventoryCountLine.findFirst({ where: { countId: count.id, productId, serial: null } })
      const line = existing
        ? await prisma.inventoryCountLine.update({ where: { id: existing.id }, data: { quantity: existing.quantity + quantity } })
        : await prisma.inventoryCountLine.create({ data: { tenantId: tenant, countId: count.id, productId, quantity, expected: false, scannedById: session.user.id } })
      await prisma.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'INVENTORY_COUNT_SCANNED', entity: 'InventoryCount', entityId: count.id, metadata: { productId, quantity, countedQuantity: line.quantity, locationId: null } } })
      return json(line)
    }

    if (action === 'cancel') {
      if (count.createdById !== session.user.id && !canManage) throw new InputError('Solo quien inició el conteo o gerencia pueden cancelarlo.', 403)
      const cancelled = await prisma.inventoryCount.update({ where: { id: count.id }, data: { status: 'CANCELLED' } })
      await prisma.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'INVENTORY_COUNT_CANCELLED', entity: 'InventoryCount', entityId: count.id, metadata: {} } })
      return json(cancelled)
    }

    if (action === 'apply') {
      const reason = textInput(body.reason, 'Motivo', 500)
      const result = await prisma.$transaction(async tx => {
        const lines = await tx.inventoryCountLine.findMany({ where: { countId: count.id } })
        if (!lines.length) throw new InputError('Escaneá al menos un equipo antes de aplicar el conteo.', 409)
        const serialLines = lines.filter(line => line.serial)
        const quantityLines = lines.filter(line => !line.serial && line.productId)
        if (count.locationId && quantityLines.length) throw new InputError('No se puede aplicar cantidad por sector al stock global de la sucursal. Retirá esas líneas o realizá un conteo por sucursal.', 409)
        const serialSnapshot = Array.isArray(count.serialSnapshot) ? count.serialSnapshot as Array<{ id: string; serial: string; productId: string }> : null
        if (count.scope === 'FULL' && !serialSnapshot) throw new InputError('Este borrador no tiene una base serial segura; iniciá un conteo nuevo antes de aplicar.', 409)
        const expectedIds = (serialSnapshot || []).map(unit => unit.id)
        const expectedUnits = expectedIds.length ? await tx.inventoryUnit.findMany({ where: { id: { in: expectedIds }, tenantId: tenant, branchId: count.branchId, status: 'AVAILABLE', ...(count.locationId ? { locationId: count.locationId } : {}) }, select: { id: true, serial: true, productId: true } }) : []
        const scanned = new Set(serialLines.map(line => line.serial as string))
        const missing = count.scope === 'FULL' ? expectedUnits.filter(unit => !scanned.has(unit.serial)) : []
        const unexpected = serialLines.filter(line => !line.expected)
        const quantityDeltas: Array<{ productId: string; before: number; counted: number; delta: number }> = []
        const productLines = count.locationId ? [] : count.scope === 'FULL'
          ? await tx.product.findMany({ where: { tenantId: tenant, branchId: count.branchId, isActive: true, NOT: { stockKind: 'EQUIPO' } }, select: { id: true, stock: true } })
          : await tx.product.findMany({ where: { tenantId: tenant, branchId: count.branchId, isActive: true, NOT: { stockKind: 'EQUIPO' }, id: { in: quantityLines.map(line => line.productId as string) } }, select: { id: true, stock: true } })
        const countByProduct = new Map(quantityLines.map(line => [line.productId as string, line.quantity]))
        const productLineIds = new Set(productLines.map(product => product.id))
        if ([...countByProduct.keys()].some(productId => !productLineIds.has(productId))) throw new InputError('Un producto contado cambió de sucursal o fue archivado; iniciá un conteo nuevo.', 409)
        const stockSnapshot = count.stockSnapshot && typeof count.stockSnapshot === 'object' && !Array.isArray(count.stockSnapshot)
          ? count.stockSnapshot as Record<string, number>
          : null
        if (quantityLines.length && !stockSnapshot) throw new InputError('Este borrador no tiene una base de stock segura; iniciá un conteo nuevo antes de ajustar cantidades.', 409)
        if (count.scope === 'FULL' && !count.locationId) {
          const currentIds = new Set(productLines.map(product => product.id))
          const snapshotIds = new Set(Object.keys(stockSnapshot || {}))
          if (currentIds.size !== snapshotIds.size || [...snapshotIds].some(productId => !currentIds.has(productId))) throw new InputError('El catálogo de la sucursal cambió durante el conteo; iniciá uno nuevo para aplicar el alcance completo.', 409)
        }
        for (const product of productLines) {
          if (stockSnapshot && !(product.id in stockSnapshot) && (count.scope === 'FULL' || countByProduct.has(product.id))) throw new InputError('El producto no estaba en la base inicial del conteo; iniciá uno nuevo.', 409)
          const counted = count.scope === 'FULL' ? (countByProduct.get(product.id) ?? 0) : countByProduct.get(product.id)!
          const before = stockSnapshot?.[product.id] ?? product.stock
          if (stockSnapshot && before !== product.stock && (count.scope === 'FULL' || countByProduct.has(product.id))) throw new InputError('El stock cambió durante el conteo. La operación sigue disponible, pero iniciá un conteo nuevo para evitar revertir ventas o recepciones.', 409)
          quantityDeltas.push({ productId: product.id, before, counted, delta: counted - before })
        }
        const adjust = body.adjust !== false
        if (adjust && missing.length) {
          const updatedUnits = await tx.inventoryUnit.updateMany({ where: { id: { in: missing.map(unit => unit.id) }, tenantId: tenant, status: 'AVAILABLE' }, data: { status: 'DEFECTIVE' } })
          if (updatedUnits.count !== missing.length) throw new InputError('El inventario serializado cambió durante el conteo; actualizá las diferencias e intentá de nuevo.', 409)
          for (const productId of new Set(missing.map(unit => unit.productId))) await recomputeStock(tx, tenant, productId)
          for (const unit of missing) await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'INVENTORY_UNIT_ADJUSTED', entity: 'InventoryUnit', entityId: unit.id, metadata: { reason: 'COUNT_MISSING', countReason: reason, serial: unit.serial, countId: count.id, before: 'AVAILABLE', after: 'DEFECTIVE', locationId: count.locationId } } })
        }
        for (const change of quantityDeltas) {
          if (!adjust) continue
          if (change.delta !== 0) {
            const updated = await tx.product.updateMany({ where: { id: change.productId, tenantId: tenant, branchId: count.branchId, stock: change.before }, data: { stock: change.counted } })
            if (updated.count !== 1) throw new InputError('El stock cambió durante el conteo; actualizá las diferencias e intentá de nuevo.', 409)
            await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'INVENTORY_COUNT_QUANTITY_ADJUSTED', entity: 'Product', entityId: change.productId, metadata: { countId: count.id, reason, branchId: count.branchId, locationId: null, before: change.before, after: change.counted, delta: change.delta } } })
          }
        }
        const response = { expectedSerialUnits: expectedUnits.length, countedSerialUnits: scanned.size, missing: missing.length, unexpected: unexpected.length, quantities: quantityDeltas, scope: count.scope, locationId: count.locationId, reason, adjust }
        const claim = await tx.inventoryCount.updateMany({ where: { id: count.id, tenantId: tenant, status: 'DRAFT' }, data: { status: 'APPLIED', appliedById: session.user.id, appliedAt: new Date(), applyResult: response } })
        if (claim.count !== 1) throw new InputError('El conteo ya fue aplicado por otra solicitud.', 409)
        const applied = await tx.inventoryCount.findFirst({ where: { id: count.id, tenantId: tenant } })
        await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'INVENTORY_COUNT_APPLIED', entity: 'InventoryCount', entityId: count.id, metadata: { branchId: count.branchId, locationId: count.locationId, scope: count.scope, expectedSerialUnits: expectedUnits.length, countedSerialUnits: scanned.size, missing: missing.length, unexpected: unexpected.length, quantities: quantityDeltas, reason, adjust } } })
        return { applied, ...response }
      })
      return json(result)
    }

    throw new InputError('Acción de conteo inválida.')
  } catch (cause) {
    if (cause instanceof InputError) return error(cause.message, cause.status)
    return error(cause instanceof Error ? cause.message : 'No se pudo actualizar el conteo.', 400)
  }
}
