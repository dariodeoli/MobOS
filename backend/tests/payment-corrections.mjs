import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'

// #393-A: corrección del medio de pago de una venta. Reversión + pagos nuevos
// que suman lo mismo (Σ CONFIRMED del pedido no cambia), permisos por rol,
// idempotencia, segunda corrección 409, lote/verificado, turno cerrado y reparto.
//
// Uso: PG_BIN=... node payment-corrections.mjs <baseUrl> <admin> <cajera> <gerente> <repartidor> <vendedor> <vendedorB> <databaseUrl>
const [base, admin, cajera, gerente, repartidor, vendedor, vendedorB, databaseUrl] = process.argv.slice(2)
if (!base || !admin || !cajera || !gerente || !repartidor || !vendedor || !vendedorB || !databaseUrl) throw new Error('Faltan argumentos (ver encabezado).')
const PG_BIN = process.env.PG_BIN || '/opt/homebrew/bin'
const sql = (consulta) => execFileSync(`${PG_BIN}/psql`, [databaseUrl, '-At', '-v', 'ON_ERROR_STOP=1', '-c', consulta], { encoding: 'utf8' }).trim()
const sufijo = Date.now().toString(36).toUpperCase()
const rama = 'branch-a-it'
let checks = 0
let secuencia = 0
const pedidos = []
const turnos = []

async function call(path, token, method = 'GET', body, headers = {}) {
  const response = await fetch(base + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'x-forwarded-for': '203.0.113.93', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const payload = await response.json().catch(() => null)
  return { status: response.status, payload }
}
async function ok(path, token, method, body, expected = 200, headers) {
  const result = await call(path, token, method, body, headers)
  assert.equal(result.status, expected, `${method} ${path}: ${JSON.stringify(result.payload)}`)
  checks++
  return result.payload
}
const clave = (etiqueta) => `pc-${sufijo}-${etiqueta}-${++secuencia}`.slice(0, 90).padEnd(16, '0')
function corregir(token, orderId, paymentId, body, key = clave('k'), expected = 201) {
  return key === null
    ? call(`/api/orders/${orderId}/payments/${paymentId}/correction`, token, 'POST', body)
    : call(`/api/orders/${orderId}/payments/${paymentId}/correction`, token, 'POST', body, { 'Idempotency-Key': key })
        .then((result) => { if (expected !== null) { assert.equal(result.status, expected, `corrección ${paymentId}: ${JSON.stringify(result.payload)}`); checks++ } return result })
}
const confirmado = (orderId) => Number(sql(`SELECT COALESCE(SUM("amountPyg"),0) FROM "Payment" WHERE "orderId"='${orderId}' AND "status"='CONFIRMED'`))
const estadoPedido = (orderId) => sql(`SELECT "status" FROM "Order" WHERE "id"='${orderId}'`)

// Cuentas y producto propios de la corrida.
const efectivo = await ok('/api/payment-accounts', admin, 'POST', { name: `Efectivo corrección ${sufijo}`, kind: 'CASH', currency: 'PYG' }, 201)
const transferencia = await ok('/api/payment-accounts', admin, 'POST', { name: `Transferencia corrección ${sufijo}`, kind: 'TRANSFER', currency: 'PYG', bank: 'Banco sintético', holder: 'Empresa prueba', accountNumber: `COR-${sufijo}` }, 201)
const dolares = await ok('/api/payment-accounts', admin, 'POST', { name: `Dólares corrección ${sufijo}`, kind: 'CASH', currency: 'USD' }, 201)
const producto = await ok('/api/products', admin, 'POST', { name: `Producto corrección ${sufijo}`, sku: `COR-${sufijo}`, pricePyg: 10000, stock: 50 }, 201)

async function pedidoPagado(token, monto, cuenta, metodo) {
  const orden = await ok('/api/orders', token, 'POST', {
    items: [{ productId: producto.id, description: producto.name, quantity: 1, unitPricePyg: monto }],
    payments: [{ accountId: cuenta.id, originalAmount: String(monto), exchangeRatePyg: '1', amountPyg: monto, method: metodo, status: 'CONFIRMED' }],
  }, 201)
  assert.equal(orden.payments.length, 1)
  pedidos.push(orden.id)
  return { order: orden, payment: orden.payments[0] }
}
// Turno propio de la prueba: si la caja ya tenía uno abierto se cierra antes, así
// los cobros de la prueba caen en una ventana que solo contiene sus datos.
async function abrirTurno(token) {
  await call(`/api/cash?branchId=${rama}`, token, 'POST', { action: 'close', countedPyg: 0 })
  const abierto = await ok(`/api/cash?branchId=${rama}`, token, 'POST', { action: 'open', openingPyg: 50000 }, 201)
  turnos.push(abierto.id)
}
const historial = async (orderId, token = admin) => (await ok(`/api/orders/${orderId}/history`, token)).events

// Política: lectura abierta, cambio solo del dueño.
assert.equal((await ok('/api/tenant/payment-correction-policy', cajera)).staffCorrectsPayments, true, 'por defecto caja corrige')
for (const token of [cajera, gerente, vendedor, repartidor]) assert.equal((await call('/api/tenant/payment-correction-policy', token, 'PUT', { staffCorrectsPayments: false })).status, 403)
assert.equal((await call('/api/tenant/payment-correction-policy', admin, 'PUT', { staffCorrectsPayments: 'no' })).status, 400)

// ── 1. Caja corrige su propio cobro del turno abierto: efectivo → transferencia ──
await abrirTurno(cajera)
const uno = await pedidoPagado(cajera, 300000, efectivo, 'CASH')
const cuerpo1 = { reason: 'Cobré en efectivo pero el cliente transfirió', payments: [{ accountId: transferencia.id, amount: 300000 }] }

assert.equal((await corregir(repartidor, uno.order.id, uno.payment.id, cuerpo1, clave('rep'), null)).status, 403, 'el repartidor nunca corrige')
assert.equal((await corregir(vendedorB, uno.order.id, uno.payment.id, cuerpo1, clave('b'), null)).status, 404, 'otro tenant no ve el pedido')
assert.equal((await corregir(vendedor, uno.order.id, uno.payment.id, cuerpo1, clave('v'), null)).status, 404, 'un vendedor ajeno al pedido no lo ve')
assert.equal((await corregir(cajera, uno.order.id, uno.payment.id, cuerpo1, null, null)).status, 400, 'sin Idempotency-Key')
assert.equal((await corregir(cajera, uno.order.id, uno.payment.id, { ...cuerpo1, reason: 'no' }, clave('r'), null)).status, 400, 'motivo corto')
assert.equal((await corregir(cajera, uno.order.id, uno.payment.id, { ...cuerpo1, payments: [{ accountId: transferencia.id, amount: 299999 }] }, clave('s'), null)).status, 400, 'no suma lo mismo')
assert.equal((await corregir(cajera, uno.order.id, uno.payment.id, { ...cuerpo1, payments: [{ accountId: dolares.id, amount: 300000 }] }, clave('u'), null)).status, 422, 'cuenta en dólares')
assert.equal((await corregir(cajera, uno.order.id, uno.payment.id, { ...cuerpo1, payments: [{ accountId: efectivo.id, amount: 300000 }] }, clave('i'), null)).status, 400, 'igual al original')
assert.equal((await corregir(cajera, uno.order.id, 'pago-inexistente', cuerpo1, clave('x'), null)).status, 404)
assert.equal(confirmado(uno.order.id), 300000, 'los rechazos no escribieron nada')
checks += 9

// Con el ajuste apagado la caja no corrige; el dueño sí.
await ok('/api/tenant/payment-correction-policy', admin, 'PUT', { staffCorrectsPayments: false })
assert.equal((await corregir(cajera, uno.order.id, uno.payment.id, cuerpo1, clave('off'), null)).status, 403, 'ajuste apagado')
await ok('/api/tenant/payment-correction-policy', admin, 'PUT', { staffCorrectsPayments: true })

const key1 = clave('ok1')
const primera = (await corregir(cajera, uno.order.id, uno.payment.id, cuerpo1, key1)).payload
assert.equal(primera.replayed, false)
assert.equal(primera.reversal.amountPyg, -300000)
assert.equal(primera.reversal.reversalOfId, uno.payment.id)
assert.equal(primera.reversal.method, 'CASH')
assert.equal(primera.reversal.status, 'CONFIRMED')
assert.equal(primera.reversal.userId, 'user-cajera-it', 'la reversión conserva al responsable del cobro')
assert.equal(primera.payments.length, 1)
assert.equal(primera.payments[0].method, 'TRANSFER')
assert.equal(primera.payments[0].amountPyg, 300000)
assert.equal(primera.payments[0].userId, 'user-cajera-it')
assert.equal(primera.correction.originSessionClosed, false)
assert.equal(primera.correction.drawerImpact, true, 'turno abierto: el neto queda en el turno')
assert.equal(confirmado(uno.order.id), 300000, 'Σ CONFIRMED no cambia')
assert.equal(estadoPedido(uno.order.id), 'COMPLETED')
assert.equal(sql(`SELECT "state" FROM "PaymentReconciliation" WHERE "paymentId"='${primera.payments[0].id}'`), 'PENDING', 'la transferencia nueva nace por conciliar')

// Historial: pagos con reversalOfId/correctionId y evento auditado.
const eventos = await historial(uno.order.id)
const pagos = eventos.filter((evento) => evento.type === 'payment').map((evento) => evento.payment)
assert.equal(pagos.length, 3, 'original + reversión + nuevo')
assert.equal(pagos.find((pago) => pago.id === primera.reversal.id).reversalOfId, uno.payment.id)
assert.equal(pagos.find((pago) => pago.id === primera.reversal.id).correctionId, primera.correction.id)
assert.equal(pagos.find((pago) => pago.id === primera.payments[0].id).correctionId, primera.correction.id)
assert.equal(pagos.find((pago) => pago.id === uno.payment.id).correctionId ?? null, null, 'el original no se edita')
const auditoria = eventos.find((evento) => evento.type === 'audit' && evento.action === 'ORDER_PAYMENT_CORRECTED')
assert.ok(auditoria, 'la cronología trae ORDER_PAYMENT_CORRECTED')
assert.equal(auditoria.metadata.correctionId, primera.correction.id)
assert.equal(auditoria.metadata.reason, cuerpo1.reason)
assert.equal(auditoria.metadata.before.method, 'CASH')
assert.equal(auditoria.metadata.after[0].method, 'TRANSFER')
assert.equal(auditoria.metadata.originSessionClosed, false)

// Reintento idempotente: 200 con lo mismo y sin filas nuevas.
const replay = (await corregir(cajera, uno.order.id, uno.payment.id, cuerpo1, key1, 200)).payload
assert.equal(replay.replayed, true)
assert.equal(replay.correction.id, primera.correction.id)
assert.equal(replay.reversal.id, primera.reversal.id)
assert.deepEqual(replay.payments.map((pago) => pago.id), primera.payments.map((pago) => pago.id))
assert.equal(Number(sql(`SELECT COUNT(*) FROM "Payment" WHERE "orderId"='${uno.order.id}'`)), 3)
// La misma clave sobre otro pago es otra operación: 409.
assert.equal((await corregir(cajera, uno.order.id, primera.payments[0].id, cuerpo1, key1, null)).status, 409)
// Segunda corrección del mismo pago (otra clave) y del pago nuevo: 409.
await corregir(cajera, uno.order.id, uno.payment.id, cuerpo1, clave('dos'), 409)
await corregir(admin, uno.order.id, uno.payment.id, cuerpo1, clave('dos-admin'), 409)
await corregir(admin, uno.order.id, primera.payments[0].id, { reason: 'volver a efectivo', payments: [{ accountId: efectivo.id, amount: 300000 }] }, clave('nuevo'), 409)
assert.equal(confirmado(uno.order.id), 300000)

// ── 2. Dividir en varios medios (administración), el pago de otra persona ──
const dos = await pedidoPagado(cajera, 500000, efectivo, 'CASH')
await corregir(admin, dos.order.id, dos.payment.id, { reason: 'Mitad efectivo y mitad transferencia', payments: [{ accountId: efectivo.id, amount: 200000 }, { accountId: transferencia.id, amount: 200000 }] }, clave('div'), 400)
const dividido = (await corregir(admin, dos.order.id, dos.payment.id, { reason: 'Mitad efectivo y mitad transferencia', payments: [{ accountId: efectivo.id, amount: 200000 }, { accountId: transferencia.id, amount: 300000 }] })).payload
assert.equal(dividido.payments.length, 2)
assert.equal(dividido.payments.reduce((total, pago) => total + pago.amountPyg, 0), 500000)
assert.equal(confirmado(dos.order.id), 500000, 'Σ CONFIRMED igual al original tras dividir')
assert.deepEqual(dividido.payments.map((pago) => pago.method).sort(), ['CASH', 'TRANSFER'])
assert.equal(dividido.payments[0].userId, 'user-cajera-it', 'los pagos nuevos conservan al responsable del cobro')

// ── 3. Verificado: solo ADMIN. En un lote: 409 para todos ──
const tres = await pedidoPagado(cajera, 400000, transferencia, 'TRANSFER')
await ok(`/api/payments/${tres.payment.id}/reconciliation`, admin, 'PATCH', { state: 'VERIFIED' })
const cuerpo3 = { reason: 'Era efectivo, no transferencia', payments: [{ accountId: efectivo.id, amount: 400000 }] }
await corregir(cajera, tres.order.id, tres.payment.id, cuerpo3, clave('ver-c'), 403)
await corregir(gerente, tres.order.id, tres.payment.id, cuerpo3, clave('ver-g'), 403)
const verificada = (await corregir(admin, tres.order.id, tres.payment.id, cuerpo3)).payload
assert.equal(verificada.payments[0].method, 'CASH')
assert.equal(confirmado(tres.order.id), 400000)

const cuatro = await pedidoPagado(cajera, 150000, transferencia, 'TRANSFER')
await ok('/api/finance/reconciliation', admin, 'POST', { action: 'batch', paymentIds: [cuatro.payment.id], receivedPyg: 150000 }, 201)
await corregir(admin, cuatro.order.id, cuatro.payment.id, { reason: 'Error de medio', payments: [{ accountId: efectivo.id, amount: 150000 }] }, clave('lote'), 409)

// Gerencia corrige cualquier pago no verificado.
const cinco = await pedidoPagado(cajera, 90000, efectivo, 'CASH')
await corregir(gerente, cinco.order.id, cinco.payment.id, { reason: 'Corrección de gerencia', payments: [{ accountId: transferencia.id, amount: 90000 }] })

// Otra sucursal: la caja de branch-a-it no ve un pedido de branch-a2-it.
const seis = await pedidoPagado(cajera, 60000, efectivo, 'CASH')
sql(`UPDATE "Order" SET "branchId"='branch-a2-it' WHERE "id"='${seis.order.id}'`)
await corregir(cajera, seis.order.id, seis.payment.id, { reason: 'Otra sucursal', payments: [{ accountId: transferencia.id, amount: 60000 }] }, clave('suc'), 404)

// ── 4. Efectivo al repartidor: PENDING con el repartidor asignado ──
const siete = await pedidoPagado(cajera, 250000, transferencia, 'TRANSFER')
const cuerpo7 = { reason: 'Pagó en efectivo al repartidor', payments: [{ accountId: efectivo.id, amount: 250000, toDriver: true }] }
await corregir(admin, siete.order.id, siete.payment.id, cuerpo7, clave('sin-rep'), 422)
await corregir(admin, siete.order.id, siete.payment.id, { ...cuerpo7, payments: [{ accountId: transferencia.id, amount: 250000, toDriver: true }] }, clave('no-efe'), 422)
await ok(`/api/orders/${siete.order.id}/assignment`, admin, 'POST', { assignedToId: 'user-repartidor-it' })
const alRepartidor = (await corregir(admin, siete.order.id, siete.payment.id, cuerpo7)).payload
assert.equal(alRepartidor.payments[0].status, 'PENDING')
assert.equal(alRepartidor.payments[0].deliveryUserId, 'user-repartidor-it')
assert.equal(confirmado(siete.order.id), 0, 'el efectivo del repartidor no cuenta hasta su rendición')
assert.equal(estadoPedido(siete.order.id), 'PENDING', 'el pedido vuelve a pendiente, coherente con la deuda')

// Deuda del cliente tras dejar el efectivo con el repartidor: igual que un pre-cobro
// común de calle (PENDING con repartidor), el pedido vuelve a figurar por cobrar
// por el monto completo hasta que la rendición se verifique.
const porCobrar = async () => (await ok('/api/finance', admin)).receivables.rows.find((fila) => fila.id === siete.order.id)
assert.equal((await porCobrar())?.pendingPyg, 250000, 'el efectivo con el repartidor es deuda pendiente del pedido')
// Quien no es administración/gerencia no puede dejar efectivo con el repartidor (403),
// aunque el pago sea suyo y de su turno abierto.
const siete2 = await pedidoPagado(cajera, 70000, transferencia, 'TRANSFER')
await ok(`/api/orders/${siete2.order.id}/assignment`, admin, 'POST', { assignedToId: 'user-repartidor-it' })
await corregir(cajera, siete2.order.id, siete2.payment.id, { reason: 'Pagó en mano al repartidor', payments: [{ accountId: efectivo.id, amount: 70000, toDriver: true }] }, clave('staff-drv'), 403)
assert.equal(confirmado(siete2.order.id), 70000)
await corregir(gerente, siete2.order.id, siete2.payment.id, { reason: 'Pagó en mano al repartidor', payments: [{ accountId: efectivo.id, amount: 70000, toDriver: true }] })

// Cobro de calle común: el repartidor cobra el saldo de un pedido y lo rinde. Ese
// cobro (con repartidor/rendición) no se corrige en v1 (422); pertenece a la rendición.
const calle = await ok('/api/orders', cajera, 'POST', {
  items: [{ productId: producto.id, description: producto.name, quantity: 1, unitPricePyg: 90000 }],
  payments: [{ accountId: efectivo.id, originalAmount: '10000', exchangeRatePyg: '1', amountPyg: 10000, method: 'CASH', status: 'CONFIRMED' }],
}, 201)
pedidos.push(calle.id)
await ok(`/api/orders/${calle.id}/assignment`, admin, 'POST', { assignedToId: 'user-repartidor-it' })
const precobro = await ok(`/api/delivery/orders/${calle.id}/collections`, repartidor, 'POST', { amountPyg: 80000, method: 'CASH' }, 201)
await corregir(admin, calle.id, precobro.id, { reason: 'Cambiar cobro de calle', payments: [{ accountId: transferencia.id, amount: 80000 }] }, clave('calle-pend'), 422)

// La rendición del repartidor cierra la deuda (también la del efectivo dejado por corrección).
const rendicion = await ok('/api/delivery/settlements', repartidor, 'POST', { note: 'Rendición con corrección' }, 201)
await ok(`/api/delivery/settlements/${rendicion.id}/verify`, cajera, 'POST', { state: 'VERIFIED' })
assert.equal(await porCobrar(), undefined, 'verificada la rendición, la deuda del pedido desaparece')
assert.equal(estadoPedido(siete.order.id), 'COMPLETED')
const bloqueado = await corregir(admin, calle.id, precobro.id, { reason: 'Cambiar cobro de calle', payments: [{ accountId: transferencia.id, amount: 80000 }] }, clave('calle'), 422)
assert.match(JSON.stringify(bloqueado.payload), /repartidor/)
assert.equal(confirmado(calle.id), 90000)

// Idempotencia con cuerpo: la misma clave con otro motivo u otros pagos es 409.
const diez = await pedidoPagado(cajera, 80000, efectivo, 'CASH')
const claveDiez = clave('cuerpo')
const cuerpoDiez = { reason: 'Era transferencia', payments: [{ accountId: transferencia.id, amount: 80000 }] }
const primeraDiez = (await corregir(cajera, diez.order.id, diez.payment.id, cuerpoDiez, claveDiez)).payload
assert.equal((await corregir(cajera, diez.order.id, diez.payment.id, cuerpoDiez, claveDiez, 200)).payload.correction.id, primeraDiez.correction.id)
await corregir(cajera, diez.order.id, diez.payment.id, { ...cuerpoDiez, reason: 'Otro motivo distinto' }, claveDiez, 409)
await corregir(cajera, diez.order.id, diez.payment.id, { reason: 'Era transferencia', payments: [{ accountId: transferencia.id, amount: 30000 }, { accountId: efectivo.id, amount: 50000 }] }, claveDiez, 409)
assert.equal(Number(sql(`SELECT COUNT(*) FROM "PaymentCorrection" WHERE "orderId"='${diez.order.id}'`)), 1)
// Un pago que nació de una corrección se corrige desde el original, con un mensaje claro.
const yaCorreccion = await corregir(admin, diez.order.id, primeraDiez.payments[0].id, { reason: 'Volver a efectivo', payments: [{ accountId: efectivo.id, amount: 80000 }] }, clave('nuevo2'), 409)
assert.match(JSON.stringify(yaCorreccion.payload), /Ya es una corrección/)

// ── 5. Turno cerrado: la caja ya no corrige; administración sí, sin tocar el cierre ──
const ocho = await pedidoPagado(cajera, 120000, efectivo, 'CASH')
const cierre = await ok(`/api/cash?branchId=${rama}`, cajera, 'POST', { action: 'close', countedPyg: 0 })
const esperadoGuardado = Number(cierre.expectedPyg)
const cuerpo8 = { reason: 'Corrección tardía', payments: [{ accountId: transferencia.id, amount: 120000 }] }
await corregir(cajera, ocho.order.id, ocho.payment.id, cuerpo8, clave('cerrado-c'), 403)
const tardia = (await corregir(admin, ocho.order.id, ocho.payment.id, cuerpo8)).payload
assert.equal(tardia.correction.originSessionClosed, true)
assert.equal(tardia.correction.drawerImpact, false, 'por defecto un turno cerrado solo ajusta reportes')
assert.equal(confirmado(ocho.order.id), 120000)
assert.equal(Number(sql(`SELECT "expectedPyg" FROM "CashSession" WHERE "id"='${cierre.id}'`)), esperadoGuardado, 'el cierre guardado no se toca')
assert.equal(sql(`SELECT "drawerImpact" FROM "PaymentCorrection" WHERE "id"='${tardia.correction.id}'`), 'f')
assert.equal(sql(`SELECT "originSessionClosed" FROM "PaymentCorrection" WHERE "id"='${tardia.correction.id}'`), 't')

// Σ CONFIRMED por pedido y base consistente (sin reversiones huérfanas).
assert.equal(Number(sql(`SELECT COUNT(*) FROM "Payment" r WHERE r."reversalOfId" IS NOT NULL AND (r."amountPyg" >= 0 OR NOT EXISTS (SELECT 1 FROM "Payment" o WHERE o."id" = r."reversalOfId" AND o."amountPyg" = -r."amountPyg"))`)), 0)

// Los datos de esta corrida se conservan a propósito (#393-B): los reportes, la caja y
// la verificación independiente de reportes que corren después tienen que netear
// las reversiones con datos reales de correcciones presentes.

console.log(`Correcciones de pago (#393-A): ${checks} checks OK · dividido ${dividido.payments.map((pago) => `${pago.method} ${pago.amountPyg}`).join(' + ')} · turno cerrado drawerImpact=${tardia.correction.drawerImpact}`)
