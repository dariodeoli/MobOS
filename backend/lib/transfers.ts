import type { Prisma } from '@prisma/client'
import { InputError } from './payment-input'
import { changeStock } from './stock'
import { revisarMinimoDeStock } from './supply-demand'
import { classifyStockKind } from './stock-kind'
import { authorizationValueOf, consumeAuthorization, usableAuthorization } from './authorizations'

const INT_MAX = 2147483647

export type TransferLineInput = { productId: string; quantity: number; serials: string[] }

export type CrearTrasladoInput = {
  tenantId: string
  fromBranchId: string
  toBranchId: string
  userId: string
  // Líneas por producto (con seriales ya normalizados) o, alternativamente,
  // las unidades puntuales a mover: se agrupan por producto de origen.
  items?: TransferLineInput[]
  unitIds?: string[]
  note?: string | null
  eta?: Date | null
  destinationLocationId?: string | null
  // Autorización de gerencia de un solo uso (roles sin stock:manage).
  authorizationId?: string | null
  // Si ya existe un traslado del tenant registrado con la misma clave, se
  // devuelve ese en lugar de crear otro (confirmaciones repetidas).
  idempotencyKey?: string | null
}

const transferInclude = {
  sourceBranch: { select: { id: true, name: true } },
  destinationBranch: { select: { id: true, name: true } },
  dispatchedBy: { select: { id: true, name: true } },
  lines: { include: { sourceProduct: { select: { id: true, name: true, sku: true } }, destinationProduct: { select: { id: true, name: true, sku: true } } } },
} satisfies Prisma.StockTransferInclude

async function lineasDesdeUnidades(tx: Prisma.TransactionClient, input: CrearTrasladoInput, unitIds: string[]): Promise<TransferLineInput[]> {
  const ids = [...new Set(unitIds)]
  const units = await tx.inventoryUnit.findMany({ where: { id: { in: ids }, tenantId: input.tenantId, branchId: input.fromBranchId, status: 'AVAILABLE' }, select: { productId: true, serial: true } })
  if (units.length !== ids.length || units.some(unit => !unit.serial)) throw new Error('Alguna unidad no está disponible en la sucursal de origen.')
  const porProducto = new Map<string, string[]>()
  for (const unit of units) porProducto.set(unit.productId, [...(porProducto.get(unit.productId) ?? []), unit.serial as string])
  return [...porProducto].map(([productId, serials]) => ({ productId, quantity: serials.length, serials }))
}

// Crea el traslado entre sucursales dentro de la transacción del llamador:
// descuenta el origen, deja en tránsito las unidades serializadas, suma el
// destino de las no serializadas y registra la auditoría.
export async function crearTraslado(tx: Prisma.TransactionClient, input: CrearTrasladoInput) {
  const { tenantId: tenant, fromBranchId: sourceBranchId, toBranchId: destinationBranchId, userId, authorizationId = null, destinationLocationId = null, note: notes = null, eta = null } = input
  if (input.idempotencyKey) {
    const previo = await tx.auditLog.findFirst({ where: { tenantId: tenant, action: 'STOCK_TRANSFERRED', entity: 'StockTransfer', metadata: { path: ['idempotencyKey'], equals: input.idempotencyKey } }, select: { entityId: true } })
    if (previo) return tx.stockTransfer.findFirstOrThrow({ where: { id: previo.entityId, tenantId: tenant }, include: transferInclude })
  }
  const lines = input.items ?? (input.unitIds ? await lineasDesdeUnidades(tx, input, input.unitIds) : [])
  if (!lines.length) throw new Error('Indicá al menos una línea para trasladar.')

  const branches = await tx.branch.findMany({ where: { tenantId: tenant, id: { in: [sourceBranchId, destinationBranchId] }, isActive: true }, select: { id: true } })
  if (branches.length !== 2) throw new Error('Sucursal de origen o destino no encontrada.')
  if (destinationLocationId && !(await tx.stockLocation.findFirst({ where: { id: destinationLocationId, tenantId: tenant, branchId: destinationBranchId, isActive: true }, select: { id: true } }))) throw new Error('Ubicación de destino no encontrada.')
  // El sujeto autorizado debe coincidir con la operación que se ejecuta.
  let autorizacion: { id: string } | null = null
  if (authorizationId) {
    const authorization = await tx.customerAuthorization.findFirst({ where: { id: authorizationId, tenantId: tenant } })
    usableAuthorization(authorization, { userId, kinds: ['TRANSFER'], label: 'transferencia' })
    const requested = authorizationValueOf(authorization!.requestedValue)
    const [line] = lines
    if (requested.sourceBranchId !== sourceBranchId || requested.destinationBranchId !== destinationBranchId || requested.productId !== line.productId) {
      throw new InputError('La autorización de transferencia no corresponde a esta operación. Solicitá una nueva.', 403)
    }
    if (Number.isSafeInteger(requested.quantity) && line.quantity > Number(requested.quantity)) {
      throw new InputError('La autorización de transferencia no alcanza la cantidad. Solicitá una nueva.', 403)
    }
    if (Array.isArray(requested.serials) && requested.serials.length > 0) {
      const autorizados = new Set(requested.serials)
      if (line.serials.some(serial => !autorizados.has(serial))) throw new InputError('La autorización de transferencia no corresponde a estos IMEI/seriales. Solicitá una nueva.', 403)
    }
    autorizacion = { id: authorization!.id }
  }
  const created = await tx.stockTransfer.create({ data: { tenantId: tenant, sourceBranchId, destinationBranchId, createdById: userId, dispatchedById: userId, eta, notes } })
  for (const line of lines) {
    const source = await tx.product.findFirst({ where: { id: line.productId, tenantId: tenant, branchId: sourceBranchId, isActive: true } })
    if (!source) throw new Error('Producto no encontrado en la sucursal de origen.')
    if (source.stock < line.quantity) throw new Error(`Stock insuficiente para ${source.name}.`)
    const unitCount = await tx.inventoryUnit.count({ where: { tenantId: tenant, productId: source.id, status: 'AVAILABLE' } })
    if (unitCount > 0 && line.serials.length !== line.quantity) throw new Error(`Indicá ${line.quantity} IMEI/serial(es) para ${source.name}.`)
    if (line.serials.length > 0) {
      const units = await tx.inventoryUnit.findMany({ where: { tenantId: tenant, productId: source.id, branchId: sourceBranchId, serial: { in: line.serials }, status: 'AVAILABLE' }, select: { id: true } })
      if (units.length !== line.serials.length) throw new Error(`Algún IMEI/serial no está disponible en ${source.name}.`)
    }
    let destination = await tx.product.findFirst({ where: { tenantId: tenant, branchId: destinationBranchId, sku: source.sku } })
    if (!destination) destination = await tx.product.create({ data: { tenantId: tenant, branchId: destinationBranchId, sku: source.sku, name: source.name, category: source.category, stockKind: source.stockKind ?? classifyStockKind({ category: source.category }), condition: source.condition, pricePyg: source.pricePyg, costPyg: source.costPyg, stock: 0 } })
    if (destination.stock > INT_MAX - line.quantity) throw new Error('El stock de destino supera el límite permitido.')
    await changeStock(tx, { tenantId: tenant, productId: source.id, delta: -line.quantity, branchId: sourceBranchId, message: 'El stock cambió mientras se procesaba la transferencia.' })
    // #250 F1: si el origen quedó bajo el punto de reposición, la reposición
    // se pide sola (una por producto/sucursal/semana).
    await revisarMinimoDeStock(tx, { tenantId: tenant, userId, productId: source.id, branchId: sourceBranchId })
    // Las líneas serializadas quedan en tránsito: el stock de destino recién
    // suma cuando el vendedor/encargado verifica físicamente la llegada.
    if (line.serials.length === 0) {
      await changeStock(tx, { tenantId: tenant, productId: destination.id, delta: line.quantity, message: 'El stock de destino supera el límite permitido.' })
    }
    if (line.serials.length > 0) {
      const moved = await tx.inventoryUnit.updateMany({ where: { tenantId: tenant, productId: source.id, branchId: sourceBranchId, serial: { in: line.serials }, status: 'AVAILABLE' }, data: { productId: destination.id, branchId: destinationBranchId, locationId: null, status: 'IN_TRANSIT' } })
      if (moved.count !== line.serials.length) throw new Error('Un IMEI/serial cambió mientras se procesaba la transferencia.')
    }
    await tx.stockTransferLine.create({ data: { transferId: created.id, sourceProductId: source.id, destinationProductId: destination.id, quantity: line.quantity, serials: line.serials } })
  }
  if (autorizacion) {
    await consumeAuthorization(tx, { id: autorizacion.id, tenantId: tenant, kinds: ['TRANSFER'], userId, label: 'transferencia' })
    await tx.auditLog.create({ data: { tenantId: tenant, userId, action: 'TRANSFER_AUTHORIZED', entity: 'StockTransfer', entityId: created.id, metadata: { authorizationId: autorizacion.id, sourceBranchId, destinationBranchId, lineCount: lines.length } } })
  }
  await tx.auditLog.create({ data: { tenantId: tenant, userId, action: 'STOCK_TRANSFERRED', entity: 'StockTransfer', entityId: created.id, metadata: { sourceBranchId, destinationBranchId, destinationLocationId, lineCount: lines.length, ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}) } } })
  return tx.stockTransfer.findUniqueOrThrow({ where: { id: created.id }, include: transferInclude })
}
