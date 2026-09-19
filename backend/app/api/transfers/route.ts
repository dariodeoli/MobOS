import { prisma } from '../../../lib/prisma'
import { error, json, tenantId } from '../../../lib/http'
import { requireSession } from '../../../lib/auth'
import { InputError } from '../../../lib/payment-input'
import { serialKey } from '../../../lib/validation'
import { changeStock } from '../../../lib/stock'
import { authorizationValueOf, consumeAuthorization, usableAuthorization } from '../../../lib/authorizations'

const INT_MAX = 2147483647
const text = (value: unknown, max = 160) => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max ? value.trim() : null

// ADMIN y GERENTE transfieren por su rol; el resto de los roles necesita una
// autorización de gerencia aprobada y de un solo uso.
function permitted(role: string) { return role === 'ADMIN' || role === 'GERENTE' }

export async function GET(request: Request) {  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (!permitted(session.user.role)) return error('No autorizado.', 403)
  const where = session.user.role === 'GERENTE' && session.user.branchId
    ? { tenantId: tenant, OR: [{ sourceBranchId: session.user.branchId }, { destinationBranchId: session.user.branchId }] }
    : { tenantId: tenant }
  return json(await prisma.stockTransfer.findMany({
    where,
    include: {
      sourceBranch: { select: { id: true, name: true } },
      destinationBranch: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
      lines: { include: { sourceProduct: { select: { id: true, name: true, sku: true } }, destinationProduct: { select: { id: true, name: true, sku: true } } } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  }))
}

export async function POST(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  let body: any
  try { body = await request.json() } catch { return error('JSON inválido.') }
  const porRol = permitted(session.user.role)
  if (!porRol && !text(body?.transferAuthorizationId, 128)) return error('Tu rol necesita autorización de gerencia para transferir entre sucursales.', 403)
  const sourceBranchId = text(body?.sourceBranchId, 128); const destinationBranchId = text(body?.destinationBranchId, 128)
  const destinationLocationId = body?.destinationLocationId === undefined || body?.destinationLocationId === null || body?.destinationLocationId === '' ? null : text(body.destinationLocationId, 128)
  const notes = body?.notes === undefined || body?.notes === null || body?.notes === '' ? null : text(body.notes, 2000)
  const rawLines = Array.isArray(body?.lines) ? body.lines : []
  if (!sourceBranchId || !destinationBranchId || sourceBranchId === destinationBranchId || rawLines.length === 0 || rawLines.length > 200) return error('Origen, destino distintos y al menos una línea son obligatorios.')
  if (body?.notes !== undefined && body?.notes !== null && body?.notes !== '' && !notes) return error('Las observaciones no pueden superar 2000 caracteres.')
  if (session.user.role !== 'ADMIN' && session.user.branchId !== sourceBranchId) return error('Solo podés transferir desde tu sucursal.', 403)
  const authorizationId = text(body?.transferAuthorizationId, 128)
  if (!porRol) {
    if (rawLines.length !== 1) return error('La transferencia autorizada mueve un solo producto.', 403)
    if (!authorizationId) return error('Tu rol necesita autorización de gerencia para transferir entre sucursales.', 403)
  }

  const seenProducts = new Set<string>()
  const lines: Array<{ productId: string; quantity: number; serials: string[] }> = []
  for (const line of rawLines) {
    const productId = text(line?.productId, 128); const quantity = Number(line?.quantity)
    if (!productId || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > INT_MAX || seenProducts.has(productId)) return error('Cada línea debe tener un producto único y una cantidad válida.')
    seenProducts.add(productId)
    const rawSerials = line?.serials === undefined ? [] : Array.isArray(line.serials) ? line.serials : null
    if (rawSerials === null || rawSerials.length > quantity) return error('Los IMEI/seriales de la línea no son válidos.')
    const serials = rawSerials.map((serial: unknown) => typeof serial === 'string' ? serialKey(serial) : '').filter(Boolean)
    if (serials.length !== rawSerials.length || new Set(serials).size !== serials.length) return error('Cada IMEI/serial debe ser válido y único dentro de la línea.')
    lines.push({ productId, quantity, serials })
  }

  try {
    const transfer = await prisma.$transaction(async tx => {
      const branches = await tx.branch.findMany({ where: { tenantId: tenant, id: { in: [sourceBranchId, destinationBranchId] }, isActive: true }, select: { id: true } })
      if (branches.length !== 2) throw new Error('Sucursal de origen o destino no encontrada.')
      if (destinationLocationId && !(await tx.stockLocation.findFirst({ where: { id: destinationLocationId, tenantId: tenant, branchId: destinationBranchId, isActive: true }, select: { id: true } }))) throw new Error('Ubicación de destino no encontrada.')
      // El sujeto autorizado debe coincidir con la operación que se ejecuta.
      let autorizacion: { id: string } | null = null
      if (!porRol && authorizationId) {
        const authorization = await tx.customerAuthorization.findFirst({ where: { id: authorizationId, tenantId: tenant } })
        usableAuthorization(authorization, { userId: session.user.id, kinds: ['TRANSFER'], label: 'transferencia' })
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
      const created = await tx.stockTransfer.create({ data: { tenantId: tenant, sourceBranchId, destinationBranchId, createdById: session.user.id, notes } })
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
        if (!destination) destination = await tx.product.create({ data: { tenantId: tenant, branchId: destinationBranchId, sku: source.sku, name: source.name, category: source.category, condition: source.condition, pricePyg: source.pricePyg, costPyg: source.costPyg, stock: 0 } })
        if (destination.stock > INT_MAX - line.quantity) throw new Error('El stock de destino supera el límite permitido.')
        await changeStock(tx, { tenantId: tenant, productId: source.id, delta: -line.quantity, branchId: sourceBranchId, message: 'El stock cambió mientras se procesaba la transferencia.' })
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
        await consumeAuthorization(tx, { id: autorizacion.id, tenantId: tenant, kinds: ['TRANSFER'], userId: session.user.id, label: 'transferencia' })
        await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'TRANSFER_AUTHORIZED', entity: 'StockTransfer', entityId: created.id, metadata: { authorizationId: autorizacion.id, sourceBranchId, destinationBranchId, lineCount: lines.length } } })
      }
      await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'STOCK_TRANSFERRED', entity: 'StockTransfer', entityId: created.id, metadata: { sourceBranchId, destinationBranchId, destinationLocationId, lineCount: lines.length } } })
      return tx.stockTransfer.findUniqueOrThrow({ where: { id: created.id }, include: { sourceBranch: { select: { id: true, name: true } }, destinationBranch: { select: { id: true, name: true } }, lines: { include: { sourceProduct: { select: { id: true, name: true, sku: true } }, destinationProduct: { select: { id: true, name: true, sku: true } } } } } })
    })
    return json(transfer, { status: 201 })
  } catch (e) {
    if (e instanceof InputError) return error(e.message, e.status)
    return error(e instanceof Error ? e.message : 'No se pudo completar la transferencia.', 409)
  }
}

// Adjunta la guía de envío AEX a un traslado ya registrado (se conoce recién
// al despachar). Solo ADMIN/GERENTE de la empresa, gerente desde su sucursal.
export async function PATCH(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (!permitted(session.user.role)) return error('No autorizado.', 403)
  let body: any
  try { body = await request.json() } catch { return error('JSON inválido.') }
  const id = text(body?.id, 128)
  if (!id || (body?.aexGuide !== null && body?.aexGuide !== '' && !text(body?.aexGuide, 100))) return error('Indicá el traslado y una guía válida de hasta 100 caracteres.')
  const aexGuide = body.aexGuide === null || body.aexGuide === '' ? null : text(body.aexGuide, 100)
  try {
    const transfer = await prisma.stockTransfer.findFirst({ where: { id, tenantId: tenant } })
    if (!transfer) return error('Traslado no encontrado.', 404)
    if (session.user.role === 'GERENTE' && session.user.branchId !== transfer.sourceBranchId) return error('Solo podés editar traslados de tu sucursal.', 403)
    const updated = await prisma.stockTransfer.update({ where: { id }, data: { aexGuide } })
    await prisma.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'TRANSFER_AEX_GUIDE_ATTACHED', entity: 'StockTransfer', entityId: id, metadata: { aexGuide } } })
    return json(updated)
  } catch (cause) { return error(cause instanceof Error ? cause.message : 'No se pudo actualizar el traslado.', 409) }
}
