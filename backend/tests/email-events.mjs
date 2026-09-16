import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

const [baseUrl, adminToken, databaseUrl] = process.argv.slice(2)
if (!baseUrl || !adminToken) throw new Error('Uso: email-events.mjs <baseUrl> <adminToken> [databaseUrl]')
const maintenanceToken = process.env.MOBOS_MAINTENANCE_TOKEN || 'it-maintenance-token'
const pgBin = process.env.MOBOS_TEST_PG_BIN || '/opt/homebrew/bin'
const psql = (sql) => execFileSync(join(pgBin, 'psql'), ['-X', '--no-psqlrc', '-At', '-v', 'ON_ERROR_STOP=1', databaseUrl, '-c', sql], { stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim()

async function request(path, method = 'GET', body, token = adminToken, tenant = 'tenant-a-it') {
  const response = await fetch(`${baseUrl}${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'x-tenant-id': tenant, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) })
  const payload = await response.json().catch(() => null)
  return { response, payload }
}

const ts = Date.now()
const suffix = `ee-${ts}`
const customerName = `Cliente Email Events ${ts}`
const customerEmail = `customer-${suffix}@example.invalid`

// 1. Garantía: creación y cambio de estado devuelven 200 sin romper el PATCH,
//    aunque el arnés no tenga relay configurado (el aviso falla tolerado).
let result = await request('/api/customers', 'POST', { name: customerName, email: customerEmail })
assert.ok([200, 201].includes(result.response.status), JSON.stringify(result.payload))
const customer = result.payload
result = await request('/api/warranties', 'POST', { customerName, serial: `EE-WARR-${ts}`, description: 'Equipo no enciende', branchId: 'branch-a-it' })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const warrantyCase = result.payload
assert.equal(warrantyCase.status, 'RECEIVED')
result = await request('/api/warranties', 'PATCH', { id: warrantyCase.id, status: 'DIAGNOSIS' })
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.equal(result.payload.status, 'DIAGNOSIS', 'El cambio de estado debe persistir aunque el correo falle.')
result = await request('/api/warranties', 'PATCH', { id: warrantyCase.id, status: 'READY' })
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.equal(result.payload.status, 'READY')

// 2. Endpoint interno de recordatorios: sin token -> 401; con token -> 200 { reminded }.
let internal = await fetch(`${baseUrl}/api/internal/remind-due-payments`, { method: 'POST' })
assert.equal(internal.status, 401, 'El endpoint interno debe exigir token de mantenimiento.')
internal = await fetch(`${baseUrl}/api/internal/remind-due-payments`, { method: 'POST', headers: { Authorization: `Bearer wrong-token` } })
assert.equal(internal.status, 401, 'Un token de mantenimiento inválido debe rechazarse.')

// Cuota por vencer: orden con cliente y un pago CREDIT PENDING con dueAt en 1 día.
result = await request('/api/orders', 'POST', { orderNumber: `EE-ORD-${ts}`, customerId: customer.id, items: [{ productId: 'prod-a-order-it', description: 'Synthetic Product A Order', quantity: 1, unitPricePyg: 100000 }] })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const orderId = result.payload.id
const orderCustomerId = result.payload.customer?.id
assert.ok(orderCustomerId, 'La orden de prueba debe quedar asociada al cliente con correo.')
const dueAt = new Date(Date.now() + 86400000).toISOString()
psql(`INSERT INTO "Payment" ("id", "tenantId", "orderId", "method", "status", "amountPyg", "reference", "paidAt", "dueAt", "createdAt") VALUES ('pay-${suffix}', 'tenant-a-it', '${orderId}', 'CREDIT', 'PENDING', 40000, 'Cuota 1/2', CURRENT_TIMESTAMP, '${dueAt}', CURRENT_TIMESTAMP);`)

internal = await fetch(`${baseUrl}/api/internal/remind-due-payments`, { method: 'POST', headers: { Authorization: `Bearer ${maintenanceToken}` } })
assert.equal(internal.status, 200, 'El recordatorio de cuotas debe responder 200 con token válido.')
const internalBody = await internal.json()
assert.ok(internalBody.reminded >= 1, `Debe recordarse la cuota por vencer: ${JSON.stringify(internalBody)}`)
assert.equal(psql(`SELECT COUNT(*) FROM "Payment" WHERE "id" = 'pay-${suffix}' AND "remindedAt" IS NOT NULL;`), '1', 'La cuota recordada debe marcar remindedAt.')
internal = await fetch(`${baseUrl}/api/internal/remind-due-payments`, { method: 'POST', headers: { Authorization: `Bearer ${maintenanceToken}` } })
const second = await internal.json()
assert.equal(second.reminded, 0, 'El recordatorio de cuotas no debe repetirse (remindedAt dedupe).')

// 3. Reserva por vencer: unidad reservada a 2 horas; el cron interno la avisa
//    una sola vez, verificable por AuditLog RESERVATION_DUE_REMINDED.
result = await request('/api/inventory-units', 'POST', { productId: 'prod-a-order-it', serial: `EE-RES-${ts}`, branchId: 'branch-a-it' })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const reservation = await request('/api/inventory-reservations', 'POST', { customerName, minutes: 120, serials: [`EE-RES-${ts}`] })
assert.equal(reservation.response.status, 201, JSON.stringify(reservation.payload))
const unitId = reservation.payload[0].id
internal = await fetch(`${baseUrl}/api/internal/remind-due-payments`, { method: 'POST', headers: { Authorization: `Bearer ${maintenanceToken}` } })
const withReservation = await internal.json()
assert.ok(withReservation.reservationReminded >= 1, `La reserva por vencer debe avisarse: ${JSON.stringify(withReservation)}`)
assert.equal(psql(`SELECT COUNT(*) FROM "AuditLog" WHERE "entityId" = '${unitId}' AND "action" = 'RESERVATION_DUE_REMINDED';`), '1', 'El aviso de reserva debe quedar auditado una sola vez.')
internal = await fetch(`${baseUrl}/api/internal/remind-due-payments`, { method: 'POST', headers: { Authorization: `Bearer ${maintenanceToken}` } })
const third = await internal.json()
assert.equal(third.reservationReminded, 0, 'El aviso de reserva no debe repetirse (AuditLog dedupe).')
assert.equal(psql(`SELECT COUNT(*) FROM "EmailOutbox" WHERE "aggregateType" = 'InventoryUnit' AND "aggregateId" = '${unitId}';`), '1', 'La reserva debe quedar encolada en el outbox una sola vez.')

console.log('email-events: checks OK (garantías sin romper PATCH, recordatorio de cuotas, aviso de reserva con dedupe).')
