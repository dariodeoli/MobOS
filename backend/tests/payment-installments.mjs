// Cobro de cuotas de un plan de crédito (#99).
// Uso: payment-installments.mjs <baseUrl> <adminToken> <databaseUrl>
//
// Regresión del flujo real: cobrar una cuota la salda sobre el mismo
// movimiento (installmentId), baja la deuda del pedido, la saca de Cobranzas
// y no duplica el cobro cuando se reintenta con la misma Idempotency-Key.
// Conciliar un pago PENDING también lo confirma o rechaza de verdad.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

const [baseUrl, adminToken, databaseUrl] = process.argv.slice(2)
if (!baseUrl || !adminToken || !databaseUrl) throw new Error('Uso: payment-installments.mjs <baseUrl> <adminToken> <databaseUrl>')
const pgBin = process.env.MOBOS_TEST_PG_BIN || '/opt/homebrew/bin'
const psql = (sql) => execFileSync(join(pgBin, 'psql'), ['-X', '--no-psqlrc', '-At', '-v', 'ON_ERROR_STOP=1', databaseUrl, '-c', sql], { stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim()

async function request(path, method = 'GET', body, { token = adminToken, key, tenant = 'tenant-a-it' } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'x-tenant-id': tenant,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(key ? { 'Idempotency-Key': key } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  const payload = await response.json().catch(() => null)
  return { response, payload }
}

const ts = Date.now()
const credito = await request('/api/customers', 'POST', { name: `Cliente Cuotas ${ts}`, phone: `982${String(ts).slice(-6)}` })
assert.equal(credito.response.status, 201, JSON.stringify(credito.payload))

// Pedido a crédito de 120.000 sin cobro: el plan de 3 cuotas de 40.000.
const pedido = await request('/api/orders', 'POST', { orderNumber: `IT-CUOTAS-${ts}`, customerId: credito.payload.id, items: [{ description: 'Equipo en cuotas IT', quantity: 1, unitPricePyg: 120000 }] })
assert.equal(pedido.response.status, 201, JSON.stringify(pedido.payload))
const orderId = pedido.payload.id
assert.equal(pedido.payload.status, 'PENDING')

const plan = await request(`/api/orders/${encodeURIComponent(orderId)}/installments`, 'POST', { count: 3, firstDueAt: new Date(Date.now() + 5 * 86400000).toISOString() })
assert.equal(plan.response.status, 201, JSON.stringify(plan.payload))
assert.equal(plan.payload.payments.length, 3)
const cuotas = plan.payload.payments
assert.ok(cuotas.every((cuota) => cuota.status === 'PENDING' && cuota.dueAt && cuota.method === 'CREDIT'))
assert.equal(cuotas.reduce((suma, cuota) => suma + cuota.amountPyg, 0), 120000)

// La cuota está en la pantalla de Cobranzas antes del cobro.
let cobranzas = await request('/api/collections/reminders')
assert.ok(cobranzas.payload.rows.some((fila) => fila.id === cuotas[0].id), 'La cuota del plan debe listarse en Cobranzas.')

// ── Cobro de la primera cuota: se salda sobre la cuota, no nace otro pago ──
const clave = `it-cuota-${ts}-0001`
const cobro = await request('/api/payments', 'POST', { orderId, method: 'CASH', amountPyg: 40000, reference: 'Caja del local', installmentId: cuotas[0].id }, { key: clave })
assert.equal(cobro.response.status, 201, JSON.stringify(cobro.payload))
assert.equal(cobro.payload.id, cuotas[0].id, 'El cobro debe saldar la cuota misma, no crear otro movimiento.')
assert.equal(psql(`SELECT COUNT(*) FROM "Payment" WHERE "orderId" = '${orderId}';`), '3', 'No debe nacer un pago paralelo a la cuota.')
assert.equal(psql(`SELECT "status"::text || '|' || "method"::text || '|' || ("paidAt" IS NOT NULL)::text FROM "Payment" WHERE "id" = '${cuotas[0].id}';`), 'CONFIRMED|CASH|true', 'La cuota queda saldada con el medio real del cobro.')
assert.equal(psql(`SELECT "reference" FROM "Payment" WHERE "id" = '${cuotas[0].id}';`), 'Caja del local')

// La deuda bajó en finanzas y la cuota ya no se reclama.
const finanzas = await request('/api/finance')
const deuda = finanzas.payload.receivables.rows.find((fila) => fila.id === orderId)
assert.equal(deuda.pendingPyg, 80000, 'La deuda del pedido debe bajar en el mismo movimiento.')
cobranzas = await request('/api/collections/reminders')
assert.ok(!cobranzas.payload.rows.some((fila) => fila.id === cuotas[0].id), 'La cuota cobrada no se reclama más.')
assert.equal(psql(`SELECT COUNT(*) FROM "AuditLog" WHERE "action" = 'CREDIT_INSTALLMENT_PAID' AND "entityId" = '${cuotas[0].id}';`), '1', 'El cobro de la cuota debe quedar auditado.')

// Cronología: el pedido y el cliente muestran el cobro confirmado.
const historial = await request(`/api/orders/${orderId}/history`)
const pagoTimeline = historial.payload.events.find((event) => event.type === 'payment' && event.id === cuotas[0].id)
assert.ok(pagoTimeline && pagoTimeline.payment.status === 'CONFIRMED', 'La cronología del pedido debe mostrar la cuota cobrada.')
const clienteTimeline = await request(`/api/customers/${credito.payload.id}/timeline`)
assert.ok(clienteTimeline.payload.events.some((event) => event.type === 'payment' && event.id === `payment-${cuotas[0].id}`), 'La cronología del cliente debe mostrar el cobro.')

// ── Reintento: misma clave devuelve el mismo cobro y no descuenta dos veces ─
const reintento = await request('/api/payments', 'POST', { orderId, method: 'CASH', amountPyg: 40000, reference: 'Caja del local', installmentId: cuotas[0].id }, { key: clave })
assert.equal(reintento.response.status, 201, JSON.stringify(reintento.payload))
assert.equal(reintento.payload.id, cuotas[0].id, 'El reintento idempotente devuelve el mismo movimiento.')
const confirmado = await request('/api/payments', 'POST', { orderId, method: 'CASH', amountPyg: 40000, reference: 'Caja del local', installmentId: cuotas[0].id }, { key: `${clave}-otra` })
assert.equal(confirmado.response.status, 409, 'Una cuota ya cobrada no se vuelve a cobrar.')
assert.equal(psql(`SELECT COALESCE(SUM("amountPyg"), 0) FROM "Payment" WHERE "orderId" = '${orderId}' AND "status" = 'CONFIRMED';`), '40000', 'La deuda no se descuenta dos veces.')

// ── Validaciones: monto exacto, cuota de otro pedido y estado confirmado ───
const montoInvalido = await request('/api/payments', 'POST', { orderId, method: 'CASH', amountPyg: 39999, installmentId: cuotas[1].id })
assert.equal(montoInvalido.response.status, 400, 'El monto debe ser exactamente el de la cuota.')
const otroPedido = await request('/api/orders', 'POST', { orderNumber: `IT-CUOTAS-B-${ts}`, customerId: credito.payload.id, items: [{ description: 'Otro pedido IT', quantity: 1, unitPricePyg: 50000 }] })
const planAjeno = await request(`/api/orders/${encodeURIComponent(otroPedido.payload.id)}/installments`, 'POST', { count: 2, firstDueAt: new Date(Date.now() + 5 * 86400000).toISOString() })
assert.equal(planAjeno.response.status, 201, JSON.stringify(planAjeno.payload))
const cruzada = await request('/api/payments', 'POST', { orderId, method: 'CASH', amountPyg: 25000, installmentId: planAjeno.payload.payments[0].id })
assert.equal(cruzada.response.status, 404, 'Una cuota de otro pedido no se cobra desde este pedido.')
const pendiente = await request('/api/payments', 'POST', { orderId, method: 'CASH', amountPyg: 40000, status: 'PENDING', installmentId: cuotas[1].id })
assert.equal(pendiente.response.status, 400, 'Una cuota se cobra como pago confirmado.')

// ── Cierre del plan: la última cuota completa el pedido ───────────────────
for (const cuota of [cuotas[1], cuotas[2]]) {
  const pago = await request('/api/payments', 'POST', { orderId, method: 'TRANSFER', amountPyg: cuota.amountPyg, installmentId: cuota.id })
  assert.equal(pago.response.status, 201, JSON.stringify(pago.payload))
  assert.equal(pago.payload.id, cuota.id)
}
assert.equal(psql(`SELECT "status" FROM "Order" WHERE "id" = '${orderId}';`), 'COMPLETED', 'Con el plan saldado el pedido queda pagado.')
cobranzas = await request('/api/collections/reminders')
assert.ok(!cobranzas.payload.rows.some((fila) => cuotas.some((cuota) => cuota.id === fila.id)), 'Ninguna cuota del plan sigue reclamándose.')

// ── Conciliar un pago PENDING lo confirma o rechaza de verdad ─────────────
const pedidoPendiente = await request('/api/orders', 'POST', { orderNumber: `IT-CONCILIA-${ts}`, customerId: credito.payload.id, items: [{ description: 'Venta con transferencia pendiente', quantity: 1, unitPricePyg: 60000 }] })
const pagoPendiente = await request('/api/payments', 'POST', { orderId: pedidoPendiente.payload.id, method: 'TRANSFER', status: 'PENDING', amountPyg: 60000, reference: 'Transferencia a confirmar' })
assert.equal(pagoPendiente.response.status, 201, JSON.stringify(pagoPendiente.payload))
const verificado = await request(`/api/payments/${encodeURIComponent(pagoPendiente.payload.id)}/reconciliation`, 'PATCH', { state: 'VERIFIED', note: 'Acreditada en el banco' })
assert.equal(verificado.response.status, 200, JSON.stringify(verificado.payload))
assert.equal(psql(`SELECT "status"::text || '|' || ("paidAt" IS NOT NULL)::text FROM "Payment" WHERE "id" = '${pagoPendiente.payload.id}';`), 'CONFIRMED|true', 'Conciliar VERIFIED confirma el pago pendiente.')
assert.equal(psql(`SELECT "status" FROM "Order" WHERE "id" = '${pedidoPendiente.payload.id}';`), 'COMPLETED', 'El pedido se cierra cuando el cobro pendiente se confirma.')
assert.equal(psql(`SELECT COUNT(*) FROM "AuditLog" WHERE "action" = 'PAYMENT_CONFIRMED' AND "entityId" = '${pagoPendiente.payload.id}';`), '1', 'La confirmación debe quedar auditada.')
const reverificado = await request(`/api/payments/${encodeURIComponent(pagoPendiente.payload.id)}/reconciliation`, 'PATCH', { state: 'VERIFIED', note: 'Acreditada en el banco' })
assert.equal(reverificado.response.status, 200)
assert.equal(psql(`SELECT COUNT(*) FROM "AuditLog" WHERE "action" = 'PAYMENT_CONFIRMED' AND "entityId" = '${pagoPendiente.payload.id}';`), '1', 'Reverificar no vuelve a confirmar ni duplica la auditoría.')

const pedidoRechazo = await request('/api/orders', 'POST', { orderNumber: `IT-CONCILIA-R-${ts}`, customerId: credito.payload.id, items: [{ description: 'Venta con cobro rechazado', quantity: 1, unitPricePyg: 30000 }] })
const pagoRechazo = await request('/api/payments', 'POST', { orderId: pedidoRechazo.payload.id, method: 'TRANSFER', status: 'PENDING', amountPyg: 30000 })
const rechazado = await request(`/api/payments/${encodeURIComponent(pagoRechazo.payload.id)}/reconciliation`, 'PATCH', { state: 'REJECTED', note: 'No ingresó' })
assert.equal(rechazado.response.status, 200, JSON.stringify(rechazado.payload))
assert.equal(psql(`SELECT "status" FROM "Payment" WHERE "id" = '${pagoRechazo.payload.id}';`), 'REJECTED', 'Conciliar REJECTED rechaza el pago pendiente.')
assert.equal(psql(`SELECT "status" FROM "Order" WHERE "id" = '${pedidoRechazo.payload.id}';`), 'PENDING', 'Un cobro rechazado no cierra el pedido.')
assert.equal(psql(`SELECT COUNT(*) FROM "AuditLog" WHERE "action" = 'PAYMENT_REJECTED' AND "entityId" = '${pagoRechazo.payload.id}';`), '1', 'El rechazo debe quedar auditado.')

console.log('payment-installments: cuota saldada, deuda y caja conciliadas, reintento idempotente y conciliación real OK.')
