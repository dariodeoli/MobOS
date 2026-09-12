import { prisma } from '../../../lib/prisma'
import { error, json, tenantId } from '../../../lib/http'
import { requireSession } from '../../../lib/auth'

const INT_MAX = 2147483647
const text = (value: unknown, max = 160) => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max ? value.trim() : null
const serialKey = (value: string) => value.trim().toUpperCase().replace(/[\s-]+/g, '')

function permitted(role: string) { return role === 'ADMIN' || role === 'GERENTE' }

export async function GET(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
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
  if (!permitted(session.user.role)) return error('No autorizado.', 403)
  let body: any
  try { body = await request.json() } catch { return error('JSON inválido.') }
  const sourceBranchId = text(body?.sourceBranchId, 128); const destinationBranchId = text(body?.destinationBranchId, 128)
  const destinationLocationId = body?.destinationLocationId === undefined || body?.destinationLocationId === null || body?.destinationLocationId === '' ? null : text(body.destinationLocationId, 128)
  const notes = body?.notes === undefined || body?.notes === null || body?.notes === '' ? null : text(body.notes, 2000)
  const rawLines = Array.isArray(body?.lines) ? body.lines : []
  if (!sourceBranchId || !destinationBranchId || sourceBranchId === destinationBranchId || rawLines.length === 0 || rawLines.length > 200) return error('Origen, destino distintos y al menos una línea son obligatorios.')
  if (body?.notes !== undefined && body?.notes !== null && body?.notes !== '' && !notes) return error('Las observaciones no pueden superar 2000 caracteres.')
  if (session.user.role === 'GERENTE' && session.user.branchId !== sourceBranchId) return error('Solo podés transferir desde tu sucursal.', 403)

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
        const decreased = await tx.product.updateMany({ where: { id: source.id, tenantId: tenant, branchId: sourceBranchId, stock: { gte: line.quantity } }, data: { stock: { decrement: line.quantity } } })
        if (decreased.count !== 1) throw new Error('El stock cambió mientras se procesaba la transferencia.')
        await tx.product.update({ where: { id: destination.id }, data: { stock: { increment: line.quantity } } })
        if (line.serials.length > 0) {
          const moved = await tx.inventoryUnit.updateMany({ where: { tenantId: tenant, productId: source.id, branchId: sourceBranchId, serial: { in: line.serials }, status: 'AVAILABLE' }, data: { productId: destination.id, branchId: destinationBranchId, locationId: destinationLocationId } })
          if (moved.count !== line.serials.length) throw new Error('Un IMEI/serial cambió mientras se procesaba la transferencia.')
        }
        await tx.stockTransferLine.create({ data: { transferId: created.id, sourceProductId: source.id, destinationProductId: destination.id, quantity: line.quantity, serials: line.serials } })
      }
      await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'STOCK_TRANSFERRED', entity: 'StockTransfer', entityId: created.id, metadata: { sourceBranchId, destinationBranchId, destinationLocationId, lineCount: lines.length } } })
      return tx.stockTransfer.findUniqueOrThrow({ where: { id: created.id }, include: { sourceBranch: { select: { id: true, name: true } }, destinationBranch: { select: { id: true, name: true } }, lines: { include: { sourceProduct: { select: { id: true, name: true, sku: true } }, destinationProduct: { select: { id: true, name: true, sku: true } } } } } })
    })
    return json(transfer, { status: 201 })
  } catch (e) { return error(e instanceof Error ? e.message : 'No se pudo completar la transferencia.', 409) }
}
