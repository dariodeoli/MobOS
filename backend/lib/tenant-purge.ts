import type { Prisma } from '@prisma/client'

// Borrado definitivo de una empresa, en orden de dependencias.
//
// La eliminación por cascada (`tenant.delete`) no alcanza cuando dos ramas del
// grafo se cruzan con FKs `onDelete: Restrict` (Payment → PaymentAccount,
// InventoryUnit → Product, CashSession → Branch/User, TradeInDevice →
// Order/Payment/Product, etc.): PostgreSQL evalúa los RESTRICT en el momento y
// el orden de las cascadas no está definido, así que el borrado puede fallar
// con P2003. Este helper elimina primero las hojas y después las raíces para
// que ninguna fila quede referenciada por otra que todavía exista.
//
// Devuelve los totales por modelo para el registro de la operación. El
// llamador decide la auditoría: la fila del AuditLog de la propia empresa se
// pierde con el borrado, así que además conviene dejar rastro en el log del
// servidor.
export type TenantPurgeCounts = Record<string, number>

type PurgeDb = Prisma.TransactionClient

export async function purgeTenantData(tx: PurgeDb, tenantId: string): Promise<TenantPurgeCounts> {
  const counts: TenantPurgeCounts = {}
  const tenant = { tenantId }
  const drop = async (name: string, run: () => Promise<{ count: number }>) => {
    const { count } = await run()
    if (count) counts[name] = (counts[name] ?? 0) + count
  }

  // Posventa y cobros: referencian pedidos, pagos, cuentas y productos.
  await drop('warrantyPhoto', () => tx.warrantyPhoto.deleteMany({ where: tenant }))
  await drop('warrantyCase', () => tx.warrantyCase.deleteMany({ where: tenant }))
  await drop('paymentProof', () => tx.paymentProof.deleteMany({ where: tenant }))
  await drop('paymentReconciliation', () => tx.paymentReconciliation.deleteMany({ where: tenant }))
  await drop('tradeInDevice', () => tx.tradeInDevice.deleteMany({ where: tenant }))
  await drop('payment', () => tx.payment.deleteMany({ where: tenant }))
  await drop('cashMovement', () => tx.cashMovement.deleteMany({ where: tenant }))
  await drop('cashSession', () => tx.cashSession.deleteMany({ where: tenant }))

  // Pedidos y sus adjuntos.
  await drop('orderCommentPhoto', () => tx.orderCommentPhoto.deleteMany({ where: tenant }))
  await drop('orderComment', () => tx.orderComment.deleteMany({ where: tenant }))
  await drop('orderAccessToken', () => tx.orderAccessToken.deleteMany({ where: tenant }))
  await drop('orderItemSerial', () => tx.orderItemSerial.deleteMany({ where: { orderItem: { order: tenant } } }))
  await drop('orderItem', () => tx.orderItem.deleteMany({ where: { order: tenant } }))
  await drop('quote', () => tx.quote.deleteMany({ where: tenant }))
  await drop('order', () => tx.order.deleteMany({ where: tenant }))

  // Compras y transferencias.
  await drop('purchasePayment', () => tx.purchasePayment.deleteMany({ where: tenant }))
  await drop('purchaseLine', () => tx.purchaseLine.deleteMany({ where: { purchase: tenant } }))
  await drop('purchaseOrder', () => tx.purchaseOrder.deleteMany({ where: tenant }))
  await drop('stockTransferLine', () => tx.stockTransferLine.deleteMany({ where: { transfer: tenant } }))
  await drop('stockTransfer', () => tx.stockTransfer.deleteMany({ where: tenant }))

  // Inventario.
  await drop('inventoryUnitCommentPhoto', () => tx.inventoryUnitCommentPhoto.deleteMany({ where: tenant }))
  await drop('inventoryUnitComment', () => tx.inventoryUnitComment.deleteMany({ where: tenant }))
  await drop('inventoryUnit', () => tx.inventoryUnit.deleteMany({ where: tenant }))
  await drop('stockLocation', () => tx.stockLocation.deleteMany({ where: tenant }))
  await drop('inventoryVisibilityGrant', () => tx.inventoryVisibilityGrant.deleteMany({ where: { OR: [{ providerTenantId: tenantId }, { recipientTenantId: tenantId }] } }))

  // Servicio técnico, clientes y catálogo comercial.
  await drop('serviceOrder', () => tx.serviceOrder.deleteMany({ where: tenant }))
  await drop('serviceItem', () => tx.serviceItem.deleteMany({ where: tenant }))
  await drop('customerAddress', () => tx.customerAddress.deleteMany({ where: { customer: tenant } }))
  await drop('customerAuthorization', () => tx.customerAuthorization.deleteMany({ where: tenant }))
  await drop('customerBillingIdentity', () => tx.customerBillingIdentity.deleteMany({ where: tenant }))
  await drop('customerNote', () => tx.customerNote.deleteMany({ where: tenant }))
  await drop('customerFollowUp', () => tx.customerFollowUp.deleteMany({ where: tenant }))
  await drop('customerPortalToken', () => tx.customerPortalToken.deleteMany({ where: tenant }))
  await drop('customer', () => tx.customer.deleteMany({ where: tenant }))
  await drop('commissionRule', () => tx.commissionRule.deleteMany({ where: tenant }))
  await drop('promotion', () => tx.promotion.deleteMany({ where: tenant }))
  await drop('costPolicy', () => tx.costPolicy.deleteMany({ where: tenant }))
  await drop('combo', () => tx.combo.deleteMany({ where: tenant }))
  await drop('messageTemplate', () => tx.messageTemplate.deleteMany({ where: tenant }))

  // Núcleo: ya no queda nada que referencie productos, cuentas ni sucursales.
  await drop('supplier', () => tx.supplier.deleteMany({ where: tenant }))
  await drop('product', () => tx.product.deleteMany({ where: tenant }))
  await drop('paymentAccount', () => tx.paymentAccount.deleteMany({ where: tenant }))
  await drop('printJob', () => tx.printJob.deleteMany({ where: tenant }))
  await drop('printPrinter', () => tx.printPrinter.deleteMany({ where: tenant }))
  await drop('printBridge', () => tx.printBridge.deleteMany({ where: tenant }))
  await drop('attachment', () => tx.attachment.deleteMany({ where: tenant }))
  await drop('attachmentTombstone', () => tx.attachmentTombstone.deleteMany({ where: tenant }))
  await drop('tenantLogo', () => tx.tenantLogo.deleteMany({ where: tenant }))
  await drop('userAvatar', () => tx.userAvatar.deleteMany({ where: { user: tenant } }))
  await drop('presenceTab', () => tx.presenceTab.deleteMany({ where: tenant }))
  await drop('usageSession', () => tx.usageSession.deleteMany({ where: tenant }))
  await drop('errorReport', () => tx.errorReport.deleteMany({ where: tenant }))
  await drop('authAttempt', () => tx.authAttempt.deleteMany({ where: tenant }))
  await drop('emailOutbox', () => tx.emailOutbox.deleteMany({ where: tenant }))
  await drop('passwordResetToken', () => tx.passwordResetToken.deleteMany({ where: tenant }))
  await drop('emailVerificationToken', () => tx.emailVerificationToken.deleteMany({ where: tenant }))
  await drop('userInvitation', () => tx.userInvitation.deleteMany({ where: tenant }))
  await drop('session', () => tx.session.deleteMany({ where: tenant }))
  await drop('user', () => tx.user.deleteMany({ where: tenant }))
  await drop('branch', () => tx.branch.deleteMany({ where: tenant }))
  await drop('aexWebhookEvent', () => tx.aexWebhookEvent.deleteMany({ where: tenant }))
  await drop('auditLog', () => tx.auditLog.deleteMany({ where: tenant }))
  await drop('googleStoreAccess', () => tx.googleStoreAccess.deleteMany({ where: tenant }))

  await drop('tenant', () => tx.tenant.deleteMany({ where: { id: tenantId } }))
  return counts
}
