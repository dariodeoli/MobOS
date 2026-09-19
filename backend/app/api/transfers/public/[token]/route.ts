import { prisma } from '../../../../../lib/prisma'
import { error, json } from '../../../../../lib/http'
import { enforceRateLimit } from '../../../../../lib/rate-limit'
import { serialKey } from '../../../../../lib/validation'
import { changeStock } from '../../../../../lib/stock'

// Vista pública del remito de traslado: origen, destino, líneas con IMEI y
// guía AEX. El destino la abre desde el QR impreso para confirmar la recepción
// física sin sesión; nunca expone costos ni datos internos.
const text = (value: unknown, max = 300) => typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : ''
const ORIGIN = 'public'

async function porToken(token: string) {
  if (!token || token.length > 200) return null
  return prisma.stockTransfer.findUnique({
    where: { publicToken: token },
    include: {
      sourceBranch: { select: { name: true, address: true, city: true, department: true, phone: true } },
      destinationBranch: { select: { name: true, address: true, city: true, department: true, phone: true } },
      createdBy: { select: { name: true } },
      lines: { include: { sourceProduct: { select: { name: true, sku: true } } } },
    },
  })
}

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params
  const transfer = await porToken(text(token, 200))
  if (!transfer) return error('Remito no encontrado.', 404)

  const [photos, receivedBy] = await Promise.all([
    prisma.attachment.findMany({
      where: { tenantId: transfer.tenantId, entity: 'STOCK_TRANSFER', entityId: transfer.id },
      select: { id: true, fileName: true, mimeType: true, sizeBytes: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
    transfer.receivedById ? prisma.user.findUnique({ where: { id: transfer.receivedById }, select: { name: true } }) : null,
  ])

  return json({
    status: transfer.receivedAt ? 'RECEIVED' : 'IN_TRANSIT',
    createdAt: transfer.createdAt,
    receivedAt: transfer.receivedAt,
    receivedBy: receivedBy?.name || null,
    receivedNote: transfer.receivedNote,
    aexGuide: transfer.aexGuide,
    notes: transfer.notes,
    sourceBranch: transfer.sourceBranch,
    destinationBranch: transfer.destinationBranch,
    createdBy: transfer.createdBy?.name || null,
    lines: transfer.lines.map(line => ({
      id: line.id,
      productName: line.sourceProduct?.name || 'Producto',
      sku: line.sourceProduct?.sku || null,
      quantity: line.quantity,
      serials: Array.isArray(line.serials) ? line.serials as string[] : [],
    })),
    photos: photos.map(photo => ({ id: photo.id, fileName: photo.fileName, mimeType: photo.mimeType, sizeBytes: photo.sizeBytes, createdAt: photo.createdAt })),
  })
}

// Recepción desde el remito: marca el traslado como recibido una sola vez y
// deja disponibles las unidades en tránsito con su stock. Equivale al verify
// interno, con auditoría de origen público y sin usuario de sesión.
export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const limited = enforceRateLimit(request, 'transfers-public', 30, 60_000)
  if (limited) return limited
  const { token } = await context.params
  let body: { action?: unknown; note?: unknown; serialsOk?: unknown }
  try { body = await request.json() } catch { return error('JSON inválido.') }
  if (body?.action !== 'receive') return error('Acción inválida.')
  const note = text(body?.note, 500)
  if (body?.note !== undefined && body?.note !== null && body?.note !== '' && !note) return error('La nota no puede superar 500 caracteres.')

  const transfer = await prisma.stockTransfer.findUnique({
    where: { publicToken: text(token, 200) },
    include: { lines: { select: { serials: true } } },
  })
  if (!transfer) return error('Remito no encontrado.', 404)
  if (transfer.receivedAt) return error('Este remito ya fue recibido.', 409)

  const seriales = transfer.lines.flatMap(line => Array.isArray(line.serials) ? line.serials as string[] : [])
  // Confirmación por serial: si el destino destilda una unidad, no se recibe
  // nada hasta completar la lista (la recepción total evita stock a medias).
  if (body?.serialsOk !== undefined) {
    if (!Array.isArray(body.serialsOk) || body.serialsOk.length > 500) return error('La confirmación de seriales no es válida.')
    const confirmados = body.serialsOk.map(serialKey).filter(Boolean)
    if (confirmados.length !== body.serialsOk.length || new Set(confirmados).size !== confirmados.length) return error('La confirmación de seriales no es válida.')
    const delRemito = new Set(seriales)
    if (confirmados.some(serial => !delRemito.has(serial))) return error('Algún IMEI/serial no pertenece a este remito.')
    if (confirmados.length !== seriales.length) return error('Confirmá todas las unidades del remito para registrar la recepción.', 409)
  }

  const now = new Date()
  try {
    const resultado = await prisma.$transaction(async tx => {
      const claim = await tx.stockTransfer.updateMany({ where: { id: transfer.id, receivedAt: null }, data: { receivedAt: now, receivedById: null, receivedNote: note || null } })
      if (claim.count !== 1) throw new Error('Este remito ya fue recibido.')
      const units = seriales.length
        ? await tx.inventoryUnit.findMany({ where: { tenantId: transfer.tenantId, serial: { in: seriales }, status: 'IN_TRANSIT' }, select: { id: true, serial: true, productId: true, branchId: true } })
        : []
      for (const unit of units) {
        await tx.inventoryUnit.update({ where: { id: unit.id }, data: { status: 'AVAILABLE', locationId: null, reservedUntil: null, reservationCustomer: null, reservedById: null } })
        await changeStock(tx, { tenantId: transfer.tenantId, productId: unit.productId, delta: 1, message: 'El stock cambió mientras se recibía el equipo.' })
        await tx.auditLog.create({ data: { tenantId: transfer.tenantId, userId: null, action: 'INVENTORY_TRANSIT_RECEIVED', entity: 'InventoryUnit', entityId: unit.id, metadata: { serial: unit.serial, branchId: unit.branchId, origin: ORIGIN } } })
      }
      await tx.auditLog.create({ data: {
        tenantId: transfer.tenantId,
        userId: null,
        action: 'STOCK_TRANSFER_RECEIVED',
        entity: 'StockTransfer',
        entityId: transfer.id,
        metadata: { origin: ORIGIN, note: note || null, serials: seriales, unitCount: units.length },
      } })
      return { status: 'RECEIVED', receivedAt: now, serials: units.map(unit => unit.serial) }
    })
    return json(resultado)
  } catch (cause) {
    return error(cause instanceof Error ? cause.message : 'No se pudo registrar la recepción.', 409)
  }
}
