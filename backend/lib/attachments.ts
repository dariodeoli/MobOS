import type { SessionContext } from './auth'
import { prisma } from './prisma'
import { ensureStoreBranch } from './store-branch'

// Adjuntos genéricos: el dueño del archivo es un documento de otro módulo
// identificado por `entity` + `entityId`. La visibilidad replica la del módulo
// dueño para no abrir una puerta lateral a los mismos datos.

export const ATTACHMENT_ENTITIES = ['EXPENSE', 'PURCHASE', 'SUPPLIER_PAYMENT', 'CASH_SESSION', 'STOCK_TRANSFER', 'SUPPLY_PURCHASE', 'SUPPLY_SHIPMENT', 'SUPPLY_RECEPTION'] as const
export type AttachmentEntity = (typeof ATTACHMENT_ENTITIES)[number]

const ROLES = ['ADMIN', 'GERENTE', 'VENDEDOR', 'CAJERA'] as const
// Mismos roles que /api/cash y /api/finance: gastos y caja solo los ve caja.
const CASH_ROLES = ['ADMIN', 'GERENTE', 'CAJERA'] as const
// Mismos roles que /api/purchases y /api/transfers.
const PURCHASE_ROLES = ['ADMIN', 'GERENTE'] as const

export function isAttachmentEntity(value: unknown): value is AttachmentEntity {
  return typeof value === 'string' && (ATTACHMENT_ENTITIES as readonly string[]).includes(value)
}

export type AttachmentTargetResult = { ok: true } | { ok: false; status: 403 | 404 }

function branchAllowed(role: string, userBranchId: string | null, targetBranchId: string | null) {
  if (role === 'ADMIN') return true
  return Boolean(userBranchId) && userBranchId === targetBranchId
}

/**
 * Valida que el documento dueño exista en el tenant y que la sesión pueda verlo.
 * Un documento ajeno al tenant devuelve 404; uno visible en otro alcance, 403.
 * Para gastos y caja la sucursal se resuelve como en /api/cash y /api/finance:
 * un GERENTE/CAJERA sin sucursal asignada la recibe con ensureStoreBranch.
 */
export async function checkAttachmentTarget(entity: AttachmentEntity, entityId: string, session: SessionContext): Promise<AttachmentTargetResult> {
  const { role, tenantId } = session.user
  if (!(ROLES as readonly string[]).includes(role)) return { ok: false, status: 403 }

  if (entity === 'EXPENSE' || entity === 'CASH_SESSION') {
    if (!(CASH_ROLES as readonly string[]).includes(role)) return { ok: false, status: 403 }
    const target = entity === 'EXPENSE'
      ? await prisma.cashMovement.findFirst({ where: { id: entityId, tenantId }, select: { branchId: true } })
      : await prisma.cashSession.findFirst({ where: { id: entityId, tenantId }, select: { branchId: true } })
    if (!target) return { ok: false, status: 404 }
    if (role === 'ADMIN') return { ok: true }
    const branchId = session.user.branchId || await ensureStoreBranch(session)
    return branchId && branchId === target.branchId ? { ok: true } : { ok: false, status: 403 }
  }

  const branchId = session.user.branchId

  if (entity === 'PURCHASE') {
    if (!(PURCHASE_ROLES as readonly string[]).includes(role)) return { ok: false, status: 403 }
    const purchase = await prisma.purchaseOrder.findFirst({ where: { id: entityId, tenantId }, select: { branchId: true } })
    if (!purchase) return { ok: false, status: 404 }
    return branchAllowed(role, branchId, purchase.branchId) ? { ok: true } : { ok: false, status: 403 }
  }

  // #250 Fase 5: fotos de la recepción (faltantes, dañados, incorrectos).
  if (entity === 'SUPPLY_RECEPTION') {
    if (!(PURCHASE_ROLES as readonly string[]).includes(role)) return { ok: false, status: 403 }
    const item = await prisma.supplyReceptionItem.findFirst({ where: { id: entityId, tenantId }, select: { reception: { select: { shipment: { select: { destinationBranchId: true } } } } } })
    if (!item) return { ok: false, status: 404 }
    return branchAllowed(role, branchId, item.reception.shipment.destinationBranchId) ? { ok: true } : { ok: false, status: 403 }
  }

  // #250 Fase 4: fotos del lote/envío entrante (carga, despacho, llegada).
  if (entity === 'SUPPLY_SHIPMENT') {
    if (!(PURCHASE_ROLES as readonly string[]).includes(role)) return { ok: false, status: 403 }
    const envio = await prisma.supplyShipment.findFirst({ where: { id: entityId, tenantId }, select: { destinationBranchId: true } })
    if (!envio) return { ok: false, status: 404 }
    return branchAllowed(role, branchId, envio.destinationBranchId) ? { ok: true } : { ok: false, status: 403 }
  }

  // #250 Fase 2: la foto de la factura de la compra del Centro de Abastecimiento.
  if (entity === 'SUPPLY_PURCHASE') {
    if (!(PURCHASE_ROLES as readonly string[]).includes(role)) return { ok: false, status: 403 }
    const compra = await prisma.supplyPurchase.findFirst({ where: { id: entityId, tenantId }, select: { branchId: true } })
    if (!compra) return { ok: false, status: 404 }
    return branchAllowed(role, branchId, compra.branchId) ? { ok: true } : { ok: false, status: 403 }
  }

  if (entity === 'SUPPLIER_PAYMENT') {
    if (!(PURCHASE_ROLES as readonly string[]).includes(role)) return { ok: false, status: 403 }
    const payment = await prisma.purchasePayment.findFirst({ where: { id: entityId, tenantId }, select: { purchase: { select: { branchId: true } } } })
    if (!payment) return { ok: false, status: 404 }
    return branchAllowed(role, branchId, payment.purchase.branchId) ? { ok: true } : { ok: false, status: 403 }
  }

  // STOCK_TRANSFER
  if (!(PURCHASE_ROLES as readonly string[]).includes(role)) return { ok: false, status: 403 }
  const transfer = await prisma.stockTransfer.findFirst({ where: { id: entityId, tenantId }, select: { sourceBranchId: true, destinationBranchId: true } })
  if (!transfer) return { ok: false, status: 404 }
  if (role === 'ADMIN') return { ok: true }
  return branchId && (branchId === transfer.sourceBranchId || branchId === transfer.destinationBranchId) ? { ok: true } : { ok: false, status: 403 }
}

export function attachmentMetadata(attachment: {
  id: string
  fileName: string
  mimeType: string
  sizeBytes: number
  sha256: string
  createdAt: Date
  createdBy: { id: string; name: string } | null
}) {
  return {
    id: attachment.id,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    sha256: attachment.sha256,
    createdAt: attachment.createdAt,
    uploadedBy: attachment.createdBy,
  }
}
