import { prisma } from '../../../../lib/prisma'
import { canAccessAny, requireSession } from '../../../../lib/auth'
import { error, json, tenantId } from '../../../../lib/http'
import { InputError, objectInput, textInput } from '../../../../lib/payment-input'
import { serialKey } from '../../../../lib/validation'
import { INVENTORY_PHYSICALLY_VERIFIED } from '../../../../lib/inventory'
import { classifyScan, summarizeVerification } from '../../../../lib/stock-verification'
import { expectedUnits, verificationDetail } from '../../../../lib/stock-verification-db'

const ROLES_DE_SUCURSAL = ['VENDEDOR', 'CAJERA']
const sinAcceso = (session: NonNullable<Awaited<ReturnType<typeof requireSession>>>, branchId: string) => ROLES_DE_SUCURSAL.includes(session.user.role) && session.user.branchId !== branchId

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  const { id } = await context.params
  const detail = await verificationDetail(tenant, id)
  if (!detail || (detail.branch && sinAcceso(session, detail.branch.id))) return error('Verificación no encontrada.', 404)
  return json(detail)
}

// Acciones: scan (escanear o tildar una fila), finish (guardar el resumen) y cancel.
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  try {
    const { id } = await context.params
    const body = objectInput(await request.json())
    const action = textInput(body.action, 'Acción', 20)
    const v = await prisma.stockVerification.findFirst({ where: { id, tenantId: tenant } })
    if (!v || sinAcceso(session, v.branchId)) throw new InputError('Verificación no encontrada.', 404)
    if (v.status !== 'OPEN') throw new InputError('La verificación ya terminó.', 409)

    if (action === 'scan') {
      const serial = serialKey(body.serial)
      if (!serial) throw new InputError('Indicá el IMEI/serial.')
      const now = new Date()
      const result = await prisma.$transaction(async tx => {
        const previa = await tx.stockVerificationScan.findUnique({ where: { verificationId_serial: { verificationId: v.id, serial } } })
        if (previa) return { duplicate: true, outcome: previa.outcome, reason: previa.reason, serial, productName: previa.productName }
        const unit = await tx.inventoryUnit.findFirst({ where: { tenantId: tenant, serial }, select: { id: true, status: true, branchId: true, locationId: true, removedAt: true, lastVerifiedAt: true, lastVerifiedById: true, verificationCount: true, product: { select: { name: true } } } })
        const verdict = classifyScan(unit, { branchId: v.branchId, locationId: v.locationId })
        const productName = unit?.product?.name ?? null
        await tx.stockVerificationScan.create({ data: { tenantId: tenant, verificationId: v.id, serial, unitId: unit?.id ?? null, outcome: verdict.outcome, reason: verdict.outcome === 'UNEXPECTED' ? verdict.reason : null, productName, scannedById: session.user.id } })
        if (verdict.outcome === 'VERIFIED' && unit) {
          await tx.inventoryUnit.update({ where: { id: unit.id }, data: { lastVerifiedAt: now, lastVerifiedById: session.user.id, verificationCount: { increment: 1 } } })
          await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: INVENTORY_PHYSICALLY_VERIFIED, entity: 'InventoryUnit', entityId: unit.id, metadata: { serial, verifiedAt: now.toISOString(), locationId: unit.locationId, verificationId: v.id, previous: { at: unit.lastVerifiedAt?.toISOString() ?? null, byId: unit.lastVerifiedById ?? null, count: unit.verificationCount } } } })
        }
        return { duplicate: false, outcome: verdict.outcome, reason: verdict.outcome === 'UNEXPECTED' ? verdict.reason : null, serial, productName }
      })
      return json(result)
    }

    const resumenActual = async () => {
      const [expected, scans] = await Promise.all([expectedUnits(prisma, v), prisma.stockVerificationScan.findMany({ where: { verificationId: v.id }, select: { serial: true, outcome: true } })])
      return summarizeVerification(expected.map(unit => unit.serial), scans)
    }

    if (action === 'finish') {
      const resumen = await resumenActual()
      const done = await prisma.stockVerification.update({ where: { id: v.id }, data: { status: 'FINISHED', finishedAt: new Date(), finishedById: session.user.id, expectedCount: resumen.expected, verifiedCount: resumen.verified, missingCount: resumen.missing, unexpectedCount: resumen.unexpected, missingSerials: resumen.pending } })
      await prisma.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'STOCK_VERIFICATION_FINISHED', entity: 'StockVerification', entityId: v.id, metadata: { expected: resumen.expected, verified: resumen.verified, missing: resumen.missing, unexpected: resumen.unexpected } } })
      return json({ id: done.id, status: done.status, summary: { expected: resumen.expected, verified: resumen.verified, missing: resumen.missing, unexpected: resumen.unexpected } })
    }

    if (action === 'cancel') {
      if (v.startedById !== session.user.id && !canAccessAny(session.user, ['stock:manage'])) throw new InputError('Solo quien inició la verificación o gerencia pueden cancelarla.', 403)
      const done = await prisma.stockVerification.update({ where: { id: v.id }, data: { status: 'CANCELLED', finishedAt: new Date(), finishedById: session.user.id } })
      await prisma.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'STOCK_VERIFICATION_CANCELLED', entity: 'StockVerification', entityId: v.id, metadata: {} } })
      return json({ id: done.id, status: done.status })
    }
    throw new InputError('Acción inválida.')
  } catch (cause) {
    if (cause instanceof InputError) return error(cause.message, cause.status)
    return error(cause instanceof Error ? cause.message : 'No se pudo actualizar la verificación.', 400)
  }
}
