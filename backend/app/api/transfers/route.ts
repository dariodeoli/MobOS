import { prisma } from '../../../lib/prisma'
import { error, json, tenantId } from '../../../lib/http'
import { canAccessAny, requireSession } from '../../../lib/auth'
import { InputError } from '../../../lib/payment-input'
import { serialKey } from '../../../lib/validation'
import { crearTraslado } from '../../../lib/transfers'

const INT_MAX = 2147483647
const text = (value: unknown, max = 160) => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max ? value.trim() : null

// #218: la ETA del lote es opcional. Viaja como fecha ISO (`YYYY-MM-DD` o
// completa); cadena vacía/null la borran y un valor inválido se rechaza en vez
// de ignorarse en silencio.
function etaOf(value: unknown): { ok: true; eta: Date | null } | { ok: false } {
  if (value === undefined || value === null || value === '') return { ok: true, eta: null }
  if (typeof value !== 'string' || value.length > 40) return { ok: false }
  const fecha = new Date(value)
  return Number.isNaN(fecha.getTime()) ? { ok: false } : { ok: true, eta: fecha }
}

// ADMIN y GERENTE transfieren por su rol; el resto de los roles necesita una
// autorización de gerencia aprobada y de un solo uso. El permiso efectivo
// permite además recortar el traslado a un gerente en particular.
function permitted(user: { permissions: string[] }) { return canAccessAny(user, ['stock:manage']) }

export async function GET(request: Request) {  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (!permitted(session.user)) return error('No autorizado.', 403)
  const where = session.user.role === 'GERENTE' && session.user.branchId
    ? { tenantId: tenant, OR: [{ sourceBranchId: session.user.branchId }, { destinationBranchId: session.user.branchId }] }
    : { tenantId: tenant }
  return json(await prisma.stockTransfer.findMany({
    where,
    include: {
      sourceBranch: { select: { id: true, name: true } },
      destinationBranch: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
      dispatchedBy: { select: { id: true, name: true } },
      receivedBy: { select: { id: true, name: true } },
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
  const porRol = permitted(session.user)
  if (!porRol && !text(body?.transferAuthorizationId, 128)) return error('Tu rol necesita autorización de gerencia para transferir entre sucursales.', 403)
  const sourceBranchId = text(body?.sourceBranchId, 128); const destinationBranchId = text(body?.destinationBranchId, 128)
  const destinationLocationId = body?.destinationLocationId === undefined || body?.destinationLocationId === null || body?.destinationLocationId === '' ? null : text(body.destinationLocationId, 128)
  const notes = body?.notes === undefined || body?.notes === null || body?.notes === '' ? null : text(body.notes, 2000)
  const etaInput = etaOf(body?.eta)
  if (!etaInput.ok) return error('La fecha estimada de llegada no es válida.')
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
    const transfer = await prisma.$transaction(tx => crearTraslado(tx, {
      tenantId: tenant, fromBranchId: sourceBranchId, toBranchId: destinationBranchId, userId: session.user.id,
      items: lines, note: notes, eta: etaInput.eta, destinationLocationId, authorizationId: porRol ? null : authorizationId,
    }))
    return json(transfer, { status: 201 })
  } catch (e) {
    if (e instanceof InputError) return error(e.message, e.status)
    return error(e instanceof Error ? e.message : 'No se pudo completar la transferencia.', 409)
  }
}

// Actualiza el traslado ya registrado: la guía de envío AEX (se conoce recién
// al despachar) y/o la ETA del lote (#218). Solo ADMIN/GERENTE de la empresa,
// gerente desde su sucursal.
export async function PATCH(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (!permitted(session.user)) return error('No autorizado.', 403)
  let body: any
  try { body = await request.json() } catch { return error('JSON inválido.') }
  const id = text(body?.id, 128)
  if (!id) return error('Indicá el traslado a actualizar.')
  const quiereGuia = body?.aexGuide !== undefined
  const quiereEta = body?.eta !== undefined
  if (!quiereGuia && !quiereEta) return error('Indicá qué actualizar: la guía AEX o la ETA del lote.')
  const aexGuide = quiereGuia ? (body.aexGuide === null || body.aexGuide === '' ? null : text(body.aexGuide, 100)) : null
  if (quiereGuia && body.aexGuide !== null && body.aexGuide !== '' && !aexGuide) return error('La guía AEX debe tener hasta 100 caracteres.')
  const etaInput = quiereEta ? etaOf(body.eta) : { ok: true as const, eta: null }
  if (!etaInput.ok) return error('La fecha estimada de llegada no es válida.')
  try {
    const transfer = await prisma.stockTransfer.findFirst({ where: { id, tenantId: tenant } })
    if (!transfer) return error('Traslado no encontrado.', 404)
    if (session.user.role === 'GERENTE' && session.user.branchId !== transfer.sourceBranchId) return error('Solo podés editar traslados de tu sucursal.', 403)
    const data: { aexGuide?: string | null; eta?: Date | null } = {}
    if (quiereGuia) data.aexGuide = aexGuide
    if (quiereEta) data.eta = etaInput.eta
    const updated = await prisma.stockTransfer.update({ where: { id }, data })
    if (quiereGuia) await prisma.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'TRANSFER_AEX_GUIDE_ATTACHED', entity: 'StockTransfer', entityId: id, metadata: { aexGuide } } })
    if (quiereEta) await prisma.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'TRANSFER_ETA_UPDATED', entity: 'StockTransfer', entityId: id, metadata: { eta: etaInput.eta?.toISOString() ?? null } } })
    return json(updated)
  } catch (cause) { return error(cause instanceof Error ? cause.message : 'No se pudo actualizar el traslado.', 409) }
}
