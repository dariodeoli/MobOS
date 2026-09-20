// Ciclo de vida de la empresa: archivar con reautenticación reciente, ventana
// recuperable con RESTORE, expiración del plazo y eliminación definitiva con
// confirmación fuerte sobre un grafo real (FKs Restrict de caja, pagos con
// cuenta, trade-in, compras, transferencias y garantías).
//
// Uso: node tests/account-lifecycle.mjs <baseUrl> <databaseUrl>
import bcrypt from 'bcryptjs'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const baseUrl = process.argv[2]
const connectionString = process.argv[3] || process.env.DATABASE_URL
if (!baseUrl || !connectionString) {
  console.error('Uso: node tests/account-lifecycle.mjs <baseUrl> <databaseUrl>')
  process.exit(2)
}
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })

const TENANT = 'tenant-life-it'
const BRANCH = 'branch-life-it'
const BRANCH_2 = 'branch-life-it-2'
const ADMIN = 'user-life-admin-it'
const SELLER = 'user-life-seller-it'
const PASSWORD = 'company-password-it'
const ADMIN_PIN = '2468'
const SELLER_PIN = '1357'
const DAY_MS = 24 * 60 * 60 * 1000

let checks = 0
function ok(condition, label) {
  if (!condition) throw new Error(label)
  checks += 1
  console.log(`ok · ${label}`)
}

function cookieValue(response, name) {
  const rows = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [response.headers.get('set-cookie') || '']
  for (const row of rows) {
    const match = String(row).match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`))
    if (match) return match[1]
  }
  return null
}

async function api(method, path, { body, token, expect, cookie } = {}) {
  const headers = {}
  if (body !== undefined) headers['content-type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`
  if (cookie) headers['x-tenant-id'] = cookie
  const response = await fetch(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  if (expect !== undefined && response.status !== expect) {
    const text = await response.text().catch(() => '')
    throw new Error(`${method} ${path}: esperado ${expect}, recibido ${response.status} ${text.slice(0, 200)}`)
  }
  return response
}

async function loginCompany(deviceId) {
  const response = await api('POST', '/api/auth/login', { body: { email: `${TENANT}@example.invalid`, password: PASSWORD, deviceId }, expect: 200 })
  return cookieValue(response, 'mobos_company_session')
}

async function loginSeller(sellerId, pin, deviceId) {
  const company = await loginCompany(deviceId)
  const response = await api('POST', '/api/auth/pin', { body: { sellerId, pin }, token: company, expect: 200 })
  return cookieValue(response, 'mobos_seller_session')
}

async function reauth(token) {
  await api('POST', '/api/account', { body: { password: PASSWORD }, token, expect: 200 })
}

async function cleanup() {
  if (!prisma) return
  try {
    const exists = await prisma.tenant.findUnique({ where: { id: TENANT }, select: { id: true } })
    if (exists) {
      // La empresa de prueba quedaría a medias si el test falla antes del
      // borrado: se limpia en orden de dependencias (mejor esfuerzo).
      await prisma.$executeRaw`DELETE FROM "WarrantyCase" WHERE "tenantId" = ${TENANT}`
      await prisma.$executeRaw`DELETE FROM "TradeInDevice" WHERE "tenantId" = ${TENANT}`
      await prisma.$executeRaw`DELETE FROM "PaymentProof" WHERE "tenantId" = ${TENANT}`
      await prisma.$executeRaw`DELETE FROM "Payment" WHERE "tenantId" = ${TENANT}`
      await prisma.$executeRaw`DELETE FROM "CashMovement" WHERE "tenantId" = ${TENANT}`
      await prisma.$executeRaw`DELETE FROM "CashSession" WHERE "tenantId" = ${TENANT}`
      await prisma.$executeRaw`DELETE FROM "OrderItemSerial" WHERE "orderItemId" IN (SELECT "id" FROM "OrderItem" WHERE "orderId" IN (SELECT "id" FROM "Order" WHERE "tenantId" = ${TENANT}))`
      await prisma.$executeRaw`DELETE FROM "OrderItem" WHERE "orderId" IN (SELECT "id" FROM "Order" WHERE "tenantId" = ${TENANT})`
      await prisma.$executeRaw`DELETE FROM "Quote" WHERE "tenantId" = ${TENANT}`
      await prisma.$executeRaw`DELETE FROM "Order" WHERE "tenantId" = ${TENANT}`
      await prisma.$executeRaw`DELETE FROM "PurchasePayment" WHERE "tenantId" = ${TENANT}`
      await prisma.$executeRaw`DELETE FROM "PurchaseLine" WHERE "purchaseId" IN (SELECT "id" FROM "PurchaseOrder" WHERE "tenantId" = ${TENANT})`
      await prisma.$executeRaw`DELETE FROM "PurchaseOrder" WHERE "tenantId" = ${TENANT}`
      await prisma.$executeRaw`DELETE FROM "StockTransferLine" WHERE "transferId" IN (SELECT "id" FROM "StockTransfer" WHERE "tenantId" = ${TENANT})`
      await prisma.$executeRaw`DELETE FROM "StockTransfer" WHERE "tenantId" = ${TENANT}`
      await prisma.$executeRaw`DELETE FROM "InventoryUnit" WHERE "tenantId" = ${TENANT}`
      await prisma.$executeRaw`DELETE FROM "PrintJob" WHERE "tenantId" = ${TENANT}`
      await prisma.$executeRaw`DELETE FROM "PrintPrinter" WHERE "tenantId" = ${TENANT}`
      await prisma.$executeRaw`DELETE FROM "PrintBridge" WHERE "tenantId" = ${TENANT}`
      await prisma.$executeRaw`DELETE FROM "Product" WHERE "tenantId" = ${TENANT}`
      await prisma.$executeRaw`DELETE FROM "PaymentAccount" WHERE "tenantId" = ${TENANT}`
      await prisma.$executeRaw`DELETE FROM "UserInvitation" WHERE "tenantId" = ${TENANT}`
      await prisma.$executeRaw`DELETE FROM "AuditLog" WHERE "tenantId" = ${TENANT}`
      await prisma.$executeRaw`DELETE FROM "Session" WHERE "tenantId" = ${TENANT}`
      await prisma.$executeRaw`DELETE FROM "User" WHERE "tenantId" = ${TENANT}`
      await prisma.$executeRaw`DELETE FROM "Branch" WHERE "tenantId" = ${TENANT}`
      await prisma.$executeRaw`DELETE FROM "Tenant" WHERE "id" = ${TENANT}`
    }
  } catch (error) {
    console.error('No se pudo limpiar la empresa de prueba:', error?.message || error)
  }
  await prisma.$disconnect()
}

async function seed() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10)
  const adminPinHash = await bcrypt.hash(ADMIN_PIN, 10)
  const sellerPinHash = await bcrypt.hash(SELLER_PIN, 10)
  await prisma.tenant.create({ data: { id: TENANT, name: 'Empresa Lifecycle IT', slug: `${TENANT}-${Date.now().toString(36)}`, email: `${TENANT}@example.invalid`, passwordHash } })
  await prisma.branch.create({ data: { id: BRANCH, tenantId: TENANT, name: 'Sucursal Lifecycle' } })
  await prisma.branch.create({ data: { id: BRANCH_2, tenantId: TENANT, name: 'Sucursal Lifecycle 2' } })
  await prisma.user.create({ data: { id: ADMIN, tenantId: TENANT, branchId: BRANCH, name: 'Admin Lifecycle', role: 'ADMIN', status: 'ACTIVE', pinHash: adminPinHash } })
  await prisma.user.create({ data: { id: SELLER, tenantId: TENANT, branchId: BRANCH, name: 'Vendedor Lifecycle', role: 'VENDEDOR', status: 'ACTIVE', pinHash: sellerPinHash } })
  const product = await prisma.product.create({ data: { tenantId: TENANT, branchId: BRANCH, sku: 'LIFE-1', name: 'Producto Lifecycle', category: 'Test', pricePyg: 1000, costPyg: 500, stock: 0 } })
  const account = await prisma.paymentAccount.create({ data: { tenantId: TENANT, name: 'Cuenta Lifecycle', currency: 'PYG', kind: 'TRANSFER' } })
  const customer = await prisma.customer.create({ data: { tenantId: TENANT, name: 'Cliente Lifecycle', createdById: ADMIN } })
  await prisma.customerAddress.create({ data: { customerId: customer.id, address: 'Calle Lifecycle 1' } })
  await prisma.customerNote.create({ data: { tenantId: TENANT, customerId: customer.id, userId: ADMIN, content: 'Nota lifecycle' } })
  const order = await prisma.order.create({ data: { tenantId: TENANT, branchId: BRANCH, customerId: customer.id, sellerId: ADMIN, orderNumber: 'LIFE-0001', status: 'COMPLETED', subtotalPyg: 1000, totalPyg: 1000, creditDays: 30, dueAt: new Date(Date.now() + 30 * DAY_MS) } })
  const item = await prisma.orderItem.create({ data: { orderId: order.id, productId: product.id, description: 'Producto Lifecycle', quantity: 1, unitPricePyg: 1000, unitCostPyg: 500, totalPyg: 1000, serials: ['SN-LIFE-1'] } })
  await prisma.orderItemSerial.create({ data: { orderItemId: item.id, serial: 'SN-LIFE-1' } })
  await prisma.orderComment.create({ data: { tenantId: TENANT, orderId: order.id, userId: ADMIN, body: 'Comentario lifecycle' } })
  const cashPayment = await prisma.payment.create({ data: { tenantId: TENANT, orderId: order.id, method: 'CASH', status: 'CONFIRMED', amountPyg: 500, userId: ADMIN } })
  await prisma.payment.create({ data: { tenantId: TENANT, orderId: order.id, accountId: account.id, accountSnapshot: { name: account.name, kind: account.kind }, currency: 'PYG', originalAmount: 500, exchangeRatePyg: 1, method: 'TRANSFER', status: 'CONFIRMED', amountPyg: 500, userId: ADMIN } })
  await prisma.paymentProof.create({ data: { tenantId: TENANT, paymentId: cashPayment.id, fileName: 'life.png', mimeType: 'image/png', sizeBytes: 3, sha256: 'lifecycle-proof', data: Buffer.from([1, 2, 3]), uploadedById: ADMIN } })
  await prisma.inventoryUnit.create({ data: { tenantId: TENANT, productId: product.id, branchId: BRANCH, serial: 'SN-LIFE-1', status: 'SOLD' } })
  await prisma.tradeInDevice.create({ data: { tenantId: TENANT, branchId: BRANCH, orderId: order.id, paymentId: cashPayment.id, productId: product.id, serial: 'TRADE-LIFE-1', model: 'Modelo Lifecycle', conditionNotes: 'Buen estado', valuePyg: 500, status: 'STOCK' } })
  await prisma.cashSession.create({ data: { id: 'cash-life-it', tenantId: TENANT, branchId: BRANCH, openedById: ADMIN, openingPyg: 0, status: 'OPEN' } })
  await prisma.cashMovement.create({ data: { tenantId: TENANT, branchId: BRANCH, accountId: account.id, createdById: ADMIN, kind: 'ADJUSTMENT', direction: 'IN', currency: 'PYG', originalAmount: 100, exchangeRatePyg: 1, amountPyg: 100, description: 'Ajuste lifecycle', status: 'CLEARED', clearedAt: new Date() } })
  await prisma.warrantyCase.create({ data: { id: 'warranty-life-it', tenantId: TENANT, branchId: BRANCH, orderItemId: item.id, customerId: customer.id, customerName: customer.name, serial: 'SN-LIFE-1', description: 'Garantía lifecycle' } })
  await prisma.quote.create({ data: { tenantId: TENANT, branchId: BRANCH, customerId: customer.id, customerName: customer.name, sellerId: ADMIN, number: 'LIFE-COT-1', subtotalPyg: 1000, totalPyg: 1000 } })
  const purchase = await prisma.purchaseOrder.create({ data: { id: `purchase-${Date.now().toString(36)}`, tenantId: TENANT, branchId: BRANCH, supplierName: 'Proveedor Lifecycle', createdById: ADMIN, status: 'RECEIVED' } })
  await prisma.purchaseLine.create({ data: { id: `purchase-line-${Date.now().toString(36)}`, purchaseId: purchase.id, productId: product.id, quantity: 1, unitCostPyg: 500 } })
  await prisma.purchasePayment.create({ data: { tenantId: TENANT, purchaseId: purchase.id, accountId: account.id, amountPyg: 500, originalAmount: 500, exchangeRatePyg: 1, createdById: ADMIN } })
  const transfer = await prisma.stockTransfer.create({ data: { tenantId: TENANT, sourceBranchId: BRANCH, destinationBranchId: BRANCH_2, createdById: ADMIN } })
  await prisma.stockTransferLine.create({ data: { transferId: transfer.id, sourceProductId: product.id, destinationProductId: product.id, quantity: 1 } })
  await prisma.userInvitation.create({ data: { tenantId: TENANT, email: 'invitado-life@example.invalid', name: 'Invitado Lifecycle', inviterId: ADMIN, tokenHash: `life-token-${Date.now()}`, expiresAt: new Date(Date.now() + 7 * DAY_MS), sentAt: new Date(), resendAvailableAt: new Date() } })
  const bridge = await prisma.printBridge.create({ data: { tenantId: TENANT, name: 'Puente Lifecycle', tokenHash: `life-bridge-${Date.now()}`, createdByUserId: ADMIN } })
  const printer = await prisma.printPrinter.create({ data: { tenantId: TENANT, bridgeId: bridge.id, name: 'Impresora Lifecycle', destination: 'lan:127.0.0.1:9100' } })
  await prisma.printJob.create({ data: { tenantId: TENANT, bridgeId: bridge.id, printerId: printer.id, destination: 'lan:127.0.0.1:9100', kind: 'TICKET', requestedByUserId: ADMIN } })
  await prisma.attachment.create({ data: { tenantId: TENANT, entity: 'Order', entityId: order.id, fileName: 'life.pdf', mimeType: 'application/pdf', sizeBytes: 3, sha256: 'lifecycle-attachment', data: Buffer.from([1, 2, 3]), createdById: ADMIN } })
  await prisma.customerPortalToken.create({ data: { tenantId: TENANT, customerId: customer.id, level: 'rapido', token: `life-portal-${Date.now()}` } })
  await prisma.presenceTab.create({ data: { tenantId: TENANT, userId: ADMIN, tabId: crypto.randomUUID(), scope: 'pos' } })
  await prisma.usageSession.create({ data: { tenantId: TENANT, userId: ADMIN, sessionKey: `life-usage-${Date.now()}`, activeSeconds: 10 } })
  await prisma.commissionRule.create({ data: { tenantId: TENANT, role: 'VENDEDOR', percentPyg: 5 } })
  await prisma.promotion.create({ data: { tenantId: TENANT, code: 'LIFE', name: 'Promo Lifecycle', kind: 'FIXED', value: 100, startsAt: new Date(Date.now() - DAY_MS), endsAt: new Date(Date.now() + DAY_MS) } })
  await prisma.messageTemplate.create({ data: { tenantId: TENANT, key: 'lifecycle', name: 'Plantilla Lifecycle', body: 'Hola' } })
  await prisma.combo.create({ data: { tenantId: TENANT, name: 'Combo Lifecycle', pricePyg: 1000 } })
  await prisma.costPolicy.create({ data: { tenantId: TENANT, category: 'Test' } })
  await prisma.serviceItem.create({ data: { tenantId: TENANT, name: 'Servicio Lifecycle' } })
  await prisma.serviceOrder.create({ data: { tenantId: TENANT, branchId: BRANCH, customerId: customer.id, customerName: customer.name, device: 'Equipo Lifecycle' } })
  await prisma.tenantLogo.create({ data: { tenantId: TENANT, variant: 'light', mimeType: 'image/png', data: Buffer.from([1, 2, 3]) } })
  await prisma.emailOutbox.create({ data: { id: `life-outbox-${Date.now()}`, tenantId: TENANT, kind: 'invitation', recipient: 'invitado-life@example.invalid', payload: '', idempotencyKey: `life-idem-${Date.now()}`, aggregateType: 'UserInvitation', aggregateId: 'life-aggregate' } })
  await prisma.authAttempt.create({ data: { tenantId: TENANT, scope: 'lifecycle', fingerprint: 'life-fingerprint' } })
  await prisma.errorReport.create({ data: { tenantId: TENANT, message: 'Error lifecycle' } })
  await prisma.attachmentTombstone.create({ data: { tenantId: TENANT, entity: 'Order', entityId: order.id, sha256: 'lifecycle-tombstone' } })
  await prisma.aexWebhookEvent.create({ data: { tenantId: TENANT, guia: 'LIFE-GUIA-1', estado: 'En tránsito' } })
  return { order, item, product }
}

try {
  await cleanup()
  await seed()

  // PATCH /api/account exige reautenticación reciente: sin ella la acción
  // sensible no procede aunque la sesión sea de ADMIN.
  const freshAdmin = await loginSeller(ADMIN, ADMIN_PIN, 'life-device-1')
  await api('PATCH', '/api/account', { body: { action: 'archiveStore', confirm: 'ARCHIVAR', password: PASSWORD }, token: freshAdmin, expect: 403 })
  checks += 1
  console.log('ok · archivar sin reautenticación reciente responde 403')

  await reauth(freshAdmin)
  await api('PATCH', '/api/account', { body: { action: 'archiveStore', confirm: 'NO', password: PASSWORD }, token: freshAdmin, expect: 400 })
  await api('PATCH', '/api/account', { body: { action: 'archiveStore', confirm: 'ARCHIVAR', password: 'contraseña-incorrecta' }, token: freshAdmin, expect: 401 })
  const archived = await api('PATCH', '/api/account', { body: { action: 'archiveStore', confirm: 'ARCHIVAR', password: PASSWORD }, token: freshAdmin, expect: 200 })
  const archivedBody = await archived.json()
  const deadline = new Date(archivedBody.recoverableUntil)
  ok(archivedBody.ok === true, 'archivar con confirmación y contraseña conserva la historia y responde ok')
  ok(deadline.getTime() - Date.now() > 29 * DAY_MS && deadline.getTime() - Date.now() <= 31 * DAY_MS, 'archivar deja una ventana recuperable de 30 días')
  await api('GET', '/api/products', { token: freshAdmin, expect: 401 })
  checks += 1
  console.log('ok · la sesión de la empresa archivada queda inutilizable')

  const blockedLogin = await api('POST', '/api/auth/login', { body: { email: `${TENANT}@example.invalid`, password: PASSWORD, deviceId: 'life-device-2' }, expect: 403 })
  ok((await blockedLogin.json()).code === 'TENANT_ARCHIVED', 'el ingreso a una empresa archivada queda bloqueado')
  await api('POST', '/api/account/recover', { body: { email: `${TENANT}@example.invalid`, password: 'otra', confirmation: 'RESTORE' }, expect: 401 })
  await api('POST', '/api/account/recover', { body: { email: `${TENANT}@example.invalid`, password: PASSWORD, confirmation: 'NO' }, expect: 400 })
  await api('POST', '/api/account/recover', { body: { email: `${TENANT}@example.invalid`, password: PASSWORD, confirmation: 'RESTORE' }, expect: 200 })
  checks += 1
  console.log('ok · reactivar dentro del plazo con correo, contraseña y RESTORE funciona')
  ok((await prisma.auditLog.count({ where: { tenantId: TENANT, action: 'TENANT_RECOVERED' } })) === 1, 'reactivar queda auditado')

  const adminAfter = await loginSeller(ADMIN, ADMIN_PIN, 'life-device-3')
  await reauth(adminAfter)
  const secondArchive = await api('PATCH', '/api/account', { body: { action: 'archive', reason: 'Prueba de plazo vencido' }, token: adminAfter, expect: 200 })
  ok(Boolean((await secondArchive.json()).recoverableUntil), 'archivar empresa también registra la ventana recuperable')
  await prisma.tenant.update({ where: { id: TENANT }, data: { recoverableUntil: new Date(Date.now() - DAY_MS) } })
  await api('POST', '/api/account/recover', { body: { email: `${TENANT}@example.invalid`, password: PASSWORD, confirmation: 'RESTORE' }, expect: 409 })
  checks += 1
  console.log('ok · el plazo vencido responde 409 y no restaura')
  await prisma.tenant.update({ where: { id: TENANT }, data: { recoverableUntil: new Date(Date.now() + DAY_MS) } })
  await api('POST', '/api/account/recover', { body: { email: `${TENANT}@example.invalid`, password: PASSWORD, confirmation: 'RESTORE' }, expect: 200 })
  checks += 1
  console.log('ok · con la ventana abierta la empresa vuelve a restaurarse')

  // Eliminación definitiva: solo ADMIN, con reautenticación, confirmación
  // fuerte y borrado en orden sobre el grafo sembrado.
  const sellerToken = await loginSeller(SELLER, SELLER_PIN, 'life-device-4')
  await api('PATCH', '/api/account', { body: { action: 'purgeStore', confirm: 'ELIMINAR', password: PASSWORD }, token: sellerToken, expect: 403 })
  checks += 1
  console.log('ok · eliminar definitivamente con rol no administrador responde 403')

  const adminFinal = await loginSeller(ADMIN, ADMIN_PIN, 'life-device-5')
  await api('PATCH', '/api/account', { body: { action: 'purgeStore', confirm: 'ELIMINAR', password: PASSWORD }, token: adminFinal, expect: 403 })
  await reauth(adminFinal)
  await api('PATCH', '/api/account', { body: { action: 'purgeStore', confirm: 'NO', password: PASSWORD }, token: adminFinal, expect: 400 })
  await api('PATCH', '/api/account', { body: { action: 'purgeStore', confirm: 'ELIMINAR', password: 'contraseña-incorrecta' }, token: adminFinal, expect: 401 })
  await api('PATCH', '/api/account', { body: { action: 'purgeStore', confirm: 'ELIMINAR', password: PASSWORD }, token: adminFinal, expect: 200 })
  checks += 1
  console.log('ok · eliminar definitivamente exige ADMIN, reautenticación, palabra y contraseña')

  ok((await prisma.tenant.findUnique({ where: { id: TENANT } })) === null, 'la empresa eliminada ya no existe')
  const remaining = await prisma.$queryRaw`
    SELECT
      (SELECT count(*) FROM "Order" WHERE "tenantId" = ${TENANT})::int AS orders,
      (SELECT count(*) FROM "Payment" WHERE "tenantId" = ${TENANT})::int AS payments,
      (SELECT count(*) FROM "CashSession" WHERE "tenantId" = ${TENANT})::int AS cash,
      (SELECT count(*) FROM "InventoryUnit" WHERE "tenantId" = ${TENANT})::int AS units,
      (SELECT count(*) FROM "WarrantyCase" WHERE "tenantId" = ${TENANT})::int AS warranties,
      (SELECT count(*) FROM "PurchaseOrder" WHERE "tenantId" = ${TENANT})::int AS purchases,
      (SELECT count(*) FROM "StockTransfer" WHERE "tenantId" = ${TENANT})::int AS transfers,
      (SELECT count(*) FROM "PrintBridge" WHERE "tenantId" = ${TENANT})::int AS bridges,
      (SELECT count(*) FROM "AuditLog" WHERE "tenantId" = ${TENANT})::int AS audits`
  ok(Object.values(remaining[0]).every((value) => Number(value) === 0), 'el borrado deja cero filas dependientes (FKs Restrict incluidas)')

  console.log(`account-lifecycle: ${checks} verificación(es) OK.`)
} catch (error) {
  console.error(error?.message || error)
  process.exitCode = 1
} finally {
  await cleanup()
}
