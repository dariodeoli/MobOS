import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'

// #393-B: los consumidores de pagos CONFIRMED netean las correcciones sin doble
// conteo. Caja (turno abierto netea; turno cerrado no toca el cierre guardado y
// aparece en «Ajustes por corrección»), reportes (suma con signo, conteos sin
// reversiones), conciliación (el par original + reversión sale de pendientes).
//
// Uso: PG_BIN=... node payment-corrections-consumers.mjs <baseUrl> <admin> <cajera> <databaseUrl>
const [base, admin, cajera, databaseUrl] = process.argv.slice(2)
if (!base || !admin || !cajera || !databaseUrl) throw new Error('Faltan argumentos (ver encabezado).')
const PG_BIN = process.env.PG_BIN || '/opt/homebrew/bin'
const sql = (consulta) => execFileSync(`${PG_BIN}/psql`, [databaseUrl, '-At', '-v', 'ON_ERROR_STOP=1', '-c', consulta], { encoding: 'utf8' }).trim()
const sufijo = Date.now().toString(36).toUpperCase()
const TENANT = 'tenant-a-it'
const rama = 'branch-a-it'
let checks = 0
let secuencia = 0

async function call(path, token, method = 'GET', body, headers = {}) {
  const response = await fetch(base + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'x-forwarded-for': '203.0.113.94', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
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
const igual = (actual, esperado, mensaje) => { assert.equal(actual, esperado, mensaje); checks++ }
const clave = (etiqueta) => `pcb-${sufijo}-${etiqueta}-${++secuencia}`.padEnd(16, '0')
const corregir = (token, orderId, paymentId, body, expected = 201) =>
  call(`/api/orders/${orderId}/payments/${paymentId}/correction`, token, 'POST', body, { 'Idempotency-Key': clave('k') })
    .then((result) => { assert.equal(result.status, expected, `corrección: ${JSON.stringify(result.payload)}`); checks++; return result.payload })

const hoy = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10)
const inicioDia = new Date(`${hoy}T00:00:00-03:00`).toISOString()
const finDia = new Date(new Date(`${hoy}T00:00:00-03:00`).getTime() + 86400000).toISOString()

const efectivo = await ok('/api/payment-accounts', admin, 'POST', { name: `Efectivo consumidores ${sufijo}`, kind: 'CASH', currency: 'PYG' }, 201)
const transferencia = await ok('/api/payment-accounts', admin, 'POST', { name: `Transferencia consumidores ${sufijo}`, kind: 'TRANSFER', currency: 'PYG', bank: 'Banco sintético', holder: 'Empresa prueba', accountNumber: `CON-${sufijo}` }, 201)
const producto = await ok('/api/products', admin, 'POST', { name: `Producto consumidores ${sufijo}`, sku: `CON-${sufijo}`, pricePyg: 10000, stock: 50 }, 201)

async function pedidoPagado(token, monto, cuenta, metodo) {
  const orden = await ok('/api/orders', token, 'POST', {
    items: [{ productId: producto.id, description: producto.name, quantity: 1, unitPricePyg: monto }],
    payments: [{ accountId: cuenta.id, originalAmount: String(monto), exchangeRatePyg: '1', amountPyg: monto, method: metodo, status: 'CONFIRMED' }],
  }, 201)
  return { order: orden, payment: orden.payments[0] }
}
async function abrirTurno() {
  await call(`/api/cash?branchId=${rama}`, cajera, 'POST', { action: 'close', countedPyg: 0 })
  return ok(`/api/cash?branchId=${rama}`, cajera, 'POST', { action: 'open', openingPyg: 50000 }, 201)
}
const caja = () => ok(`/api/cash?branchId=${rama}`, cajera)
const sesiones = async () => (await ok(`/api/cash?branchId=${rama}&sesiones=1&from=${hoy}&to=${hoy}`, cajera)).sesiones
const baseMonto = 70000 + (Date.now() % 9000) * 10

// Cálculo independiente de la auditoría del día en JS sobre las filas crudas de la
// base (no repite el SQL de la ruta): suma por medio y conteo de pagos vigentes.
function filasDelDia() {
  const crudo = sql(`SELECT p."id", p."method", p."status", p."amountPyg", COALESCE(p."reversalOfId",''), COALESCE(c."drawerImpact"::text,''), COALESCE(p."correctionId",'')
    FROM "Payment" p JOIN "Order" o ON o."id" = p."orderId" LEFT JOIN "PaymentCorrection" c ON c."id" = p."correctionId"
    WHERE p."tenantId"='${TENANT}' AND o."branchId"='${rama}' AND p."paidAt" >= '${inicioDia}' AND p."paidAt" < '${finDia}'`.replace(/\s+/g, ' '))
  return crudo.split('\n').filter(Boolean).map((linea) => {
    const [id, method, status, amount, reversalOfId, drawerImpact] = linea.split('|')
    return { id, method, status, amount: Number(amount), reversalOfId, sinCajon: drawerImpact === 'f' }
  })
}
function auditoriaEsperada() {
  const filas = filasDelDia().filter((fila) => fila.status === 'CONFIRMED' && !fila.sinCajon)
  const revertidoConCajon = new Set(filas.filter((fila) => fila.reversalOfId).map((fila) => fila.reversalOfId))
  const porMedio = {}
  for (const fila of filas) {
    const grupo = (porMedio[fila.method] ??= { amountPyg: 0, count: 0 })
    grupo.amountPyg += fila.amount
    if (!fila.reversalOfId && !revertidoConCajon.has(fila.id)) grupo.count += 1
  }
  const totales = Object.values(porMedio).reduce((total, grupo) => ({ amountPyg: total.amountPyg + grupo.amountPyg, count: total.count + grupo.count }), { amountPyg: 0, count: 0 })
  return { porMedio, totales }
}
const auditar = () => ok(`/api/cash/audit?branchId=${rama}&date=${hoy}`, cajera)

// ── 1. Turno abierto: la corrección netea en el mismo turno ──
const turnoA = await abrirTurno()
const esperadoInicial = Number((await caja()).expectedPyg)
const uno = await pedidoPagado(cajera, baseMonto, efectivo, 'CASH')
igual(Number((await caja()).expectedPyg), esperadoInicial + baseMonto, 'el cobro en efectivo suma al esperado')
const c1 = await corregir(cajera, uno.order.id, uno.payment.id, { reason: 'Era transferencia', payments: [{ accountId: transferencia.id, amount: baseMonto }] })
igual(c1.correction.drawerImpact, true)
igual(Number((await caja()).expectedPyg), esperadoInicial, 'turno abierto: original + reversión netean en el esperado')
const turnoAfila = (await sesiones()).find((fila) => fila.id === turnoA.id)
igual(turnoAfila.efectivoPyg, 0, 'el corte por sesión netea el efectivo')
igual(turnoAfila.pagosEfectivo, 0, 'el conteo de pagos en efectivo no cuenta la reversión ni el original revertido')
assert.ok(!(await caja()).corrections.items.some((item) => item.orderId === uno.order.id), 'una corrección con impacto en caja no es un ajuste aparte'); checks++

// ── 2. Turno cerrado: el cierre guardado no se toca y se informa como ajuste ──
await abrirTurno()
const dos = await pedidoPagado(cajera, baseMonto + 1000, efectivo, 'CASH')
const turnoBId = (await caja()).id
const cierre = await ok(`/api/cash?branchId=${rama}`, cajera, 'POST', { action: 'close', countedPyg: 0 })
const esperadoGuardado = Number(cierre.expectedPyg)
const turnoC = await ok(`/api/cash?branchId=${rama}`, cajera, 'POST', { action: 'open', openingPyg: 50000 }, 201)
const esperadoTurnoC = Number((await caja()).expectedPyg)
const filaBantes = (await sesiones()).find((fila) => fila.id === turnoBId)
const auditoriaAntesC2 = await auditar()
const c2 = await corregir(admin, dos.order.id, dos.payment.id, { reason: 'Corrección tardía', payments: [{ accountId: transferencia.id, amount: baseMonto + 1000 }] })
igual(c2.correction.drawerImpact, false)
{
  // Efectivo cerrado de 1 venta corregido a transferencia: la venta no se duplica ni se pierde en la auditoría.
  const despues = await auditar()
  igual(despues.totals.amountPyg, auditoriaAntesC2.totals.amountPyg, 'auditoría: total del día igual tras corregir un turno cerrado')
  igual(despues.totals.count, auditoriaAntesC2.totals.count, 'auditoría: conteo igual tras corregir un turno cerrado')
  for (const medio of ['CASH', 'TRANSFER']) igual(despues.methods.find((fila) => fila.method === medio).amountPyg, auditoriaAntesC2.methods.find((fila) => fila.method === medio).amountPyg, `auditoría ${medio}: sin cambios`)
}
igual(Number(sql(`SELECT "expectedPyg" FROM "CashSession" WHERE "id"='${turnoBId}'`)), esperadoGuardado, 'el cierre guardado no cambia')
igual(Number((await caja()).expectedPyg), esperadoTurnoC, 'el turno vigente no recibe la reversión de un turno cerrado')
const filas = await sesiones()
const filaB = filas.find((fila) => fila.id === turnoBId)
igual(filaB.efectivoPyg, filaBantes.efectivoPyg, 'el efectivo del turno cerrado queda igual')
igual(filaB.esperadoPyg, esperadoGuardado)
igual(filas.find((fila) => fila.id === turnoC.id).efectivoPyg, 0, 'el turno vigente no suma la reversión')
const ajustes = (await caja()).corrections
const ajuste = ajustes.items.find((item) => item.orderId === dos.order.id)
assert.ok(ajuste, 'aparece en Ajustes por corrección'); checks++
igual(ajuste.cashDeltaPyg, -(baseMonto + 1000), 'el ajuste saca el efectivo del pago original')
igual(ajuste.drawerImpact, false)
assert.ok(ajustes.count >= 1 && ajustes.cashDeltaPyg <= ajuste.cashDeltaPyg); checks++

// Caso inverso: transferencia cobrada en un turno ya cerrado, corregida a efectivo.
const tr = await pedidoPagado(cajera, baseMonto + 3000, transferencia, 'TRANSFER')
await ok(`/api/cash?branchId=${rama}`, cajera, 'POST', { action: 'close', countedPyg: 0 })
await ok(`/api/cash?branchId=${rama}`, cajera, 'POST', { action: 'open', openingPyg: 50000 }, 201)
const auditoriaAntesInverso = await auditar()
const cInv = await corregir(admin, tr.order.id, tr.payment.id, { reason: 'Era efectivo', payments: [{ accountId: efectivo.id, amount: baseMonto + 3000 }] })
igual(cInv.correction.drawerImpact, false)
const auditoriaInversa = await auditar()
igual(auditoriaInversa.totals.amountPyg, auditoriaAntesInverso.totals.amountPyg, 'auditoría inversa: el total no se anula ni se duplica')
igual(auditoriaInversa.totals.count, auditoriaAntesInverso.totals.count)
igual(auditoriaInversa.methods.find((fila) => fila.method === 'CASH').amountPyg, auditoriaAntesInverso.methods.find((fila) => fila.method === 'CASH').amountPyg, 'el efectivo del cajón cerrado no cambia')

// ── 3. Auditoría de caja: efectivo del día contra la base ──
const dentroDelDia = `p."paidAt" >= '${inicioDia}' AND p."paidAt" < '${finDia}'`
const baseCaja = `FROM "Payment" p JOIN "Order" o ON o."id" = p."orderId" WHERE p."tenantId"='${TENANT}' AND o."branchId"='${rama}' AND ${dentroDelDia}`
const noCajon = `NOT EXISTS (SELECT 1 FROM "PaymentCorrection" c WHERE c."id" = p."correctionId" AND c."drawerImpact" = false)`
const vigente = `p."reversalOfId" IS NULL AND NOT EXISTS (SELECT 1 FROM "Payment" r WHERE r."reversalOfId" = p."id")`
const auditoria = await auditar()
const esperada = auditoriaEsperada()
igual(auditoria.totals.amountPyg, esperada.totales.amountPyg, 'auditoría: total del día = Σ independiente')
igual(auditoria.totals.count, esperada.totales.count, 'auditoría: conteo del día = independiente')
for (const medio of ['CASH', 'TRANSFER']) {
  const fila = auditoria.methods.find((item) => item.method === medio)
  igual(fila.amountPyg, esperada.porMedio[medio]?.amountPyg ?? 0, `auditoría ${medio}: monto`)
  igual(fila.count, esperada.porMedio[medio]?.count ?? 0, `auditoría ${medio}: conteo`)
}
assert.ok(auditoria.corrections.items.some((item) => item.orderId === dos.order.id)); checks++
const operaciones = await ok(`/api/cash/audit-operations?branchId=${rama}&from=${hoy}&to=${hoy}`, cajera)
const idsCajon = new Set(sql(`SELECT p."id" ${baseCaja} AND p."method"='CASH' AND p."status"='CONFIRMED' AND ${noCajon}`).split('\n').filter(Boolean))
const idsOperaciones = new Set(operaciones.operaciones.filter((op) => op.kind === 'PAYMENT').map((op) => op.id))
igual(idsOperaciones.size, idsCajon.size, 'audit-operations: mismos cobros en efectivo que la base')
assert.ok([...idsOperaciones].every((id) => idsCajon.has(id))); checks++
assert.ok(operaciones.corrections.items.some((item) => item.orderId === dos.order.id)); checks++

// ── 4. Reportes: sumas con signo y conteos sin reversiones ──
const rangoOrden = `o."tenantId"='${TENANT}' AND o."status" <> 'CANCELLED' AND o."createdAt" >= '${inicioDia}' AND o."createdAt" < '${finDia}'`
const porVendedor = await ok(`/api/reports?from=${hoy}&to=${hoy}&groupBy=seller`, admin)
igual(porVendedor.totals.collectedPyg, Number(sql(`SELECT COALESCE(SUM(p."amountPyg"),0) FROM "Payment" p JOIN "Order" o ON o."id" = p."orderId" WHERE ${rangoOrden} AND p."status"='CONFIRMED'`)), 'reportes: cobrado = Σ de la base con signo')
const porMedio = await ok(`/api/reports?from=${hoy}&to=${hoy}&groupBy=payments&paymentsBy=method`, admin)
igual(porMedio.totals.units, Number(sql(`SELECT COUNT(*) FROM "Payment" p JOIN "Order" o ON o."id" = p."orderId" WHERE ${rangoOrden} AND p."status" <> 'REFUNDED' AND ${vigente}`)), 'reportes: el conteo de pagos excluye reversiones y revertidos')
for (const metodo of ['CASH', 'TRANSFER']) {
  const grupo = porMedio.groups.find((fila) => fila.label === metodo)
  igual(grupo.units, Number(sql(`SELECT COUNT(*) FROM "Payment" p JOIN "Order" o ON o."id" = p."orderId" WHERE ${rangoOrden} AND p."method"='${metodo}' AND p."status" <> 'REFUNDED' AND ${vigente}`)), `reportes ${metodo}: conteo`)
  igual(grupo.collectedPyg, Number(sql(`SELECT COALESCE(SUM(p."amountPyg"),0) FROM "Payment" p JOIN "Order" o ON o."id" = p."orderId" WHERE ${rangoOrden} AND p."method"='${metodo}' AND p."status" <> 'REFUNDED'`)), `reportes ${metodo}: monto neto`)
}
// Finanzas: el saldo por cobrar y el cobrado de los pedidos corregidos no cambian.
for (const pedido of [uno.order, dos.order]) igual(Number(sql(`SELECT COALESCE(SUM("amountPyg"),0) FROM "Payment" WHERE "orderId"='${pedido.id}' AND "status"='CONFIRMED'`)), Number(pedido.totalPyg), 'Σ CONFIRMED = total del pedido')

// ── 5. Conciliación: el par original + reversión sale de pendientes ──
const montoTransfer = baseMonto + 7
const tres = await pedidoPagado(cajera, montoTransfer, transferencia, 'TRANSFER')
const pendientes = async () => (await ok(`/api/finance/reconciliation?from=${hoy}&to=${hoy}`, admin)).items
assert.ok((await pendientes()).some((item) => item.id === tres.payment.id), 'antes de corregir la transferencia está por conciliar'); checks++
const importar = (monto) => ok('/api/payments/reconcile-import', admin, 'POST', { rows: [{ date: hoy, amountPyg: monto }] })
assert.ok(JSON.stringify(await importar(montoTransfer)).includes(tres.payment.id), 'el extracto empareja el original antes de corregir'); checks++
const c3 = await corregir(admin, tres.order.id, tres.payment.id, { reason: 'Era efectivo', payments: [{ accountId: efectivo.id, amount: montoTransfer }] })
const despues = await pendientes()
assert.ok(!despues.some((item) => item.id === tres.payment.id || item.id === c3.reversal.id), 'ni el original ni la reversión quedan en la lista'); checks++
assert.ok(despues.every((item) => item.montoPyg > 0), 'no hay montos negativos en conciliación'); checks++
const reversados = new Set(sql(`SELECT "reversalOfId" FROM "Payment" WHERE "reversalOfId" IS NOT NULL`).split('\n').filter(Boolean))
assert.ok(despues.every((item) => !reversados.has(item.id)), 'ningún pago revertido en conciliación'); checks++
assert.ok(!JSON.stringify(await importar(montoTransfer)).includes(tres.payment.id), 'el extracto ya no empareja el original'); checks++
const finanzas = await ok(`/api/finance?branchId=${rama}`, admin)
assert.ok(!finanzas.reconciliations.some((fila) => fila.paymentId === tres.payment.id), 'finanzas: sin el original en pendientes'); checks++
assert.equal((await call('/api/finance/reconciliation', admin, 'POST', { action: 'batch', paymentIds: [tres.payment.id], receivedPyg: montoTransfer })).status, 409, 'el original corregido no entra a un lote'); checks++
assert.equal((await call(`/api/payments/${tres.payment.id}/reconciliation`, admin, 'PATCH', { state: 'VERIFIED' })).status, 409, 'ni se concilia a mano'); checks++
// La transferencia nueva del primer caso sí queda pendiente.
assert.ok((await pendientes()).some((item) => item.id === c1.payments[0].id), 'la transferencia nueva está por conciliar'); checks++

// ── 6. Invariantes de la base con correcciones presentes ──
igual(Number(sql(`SELECT COUNT(*) FROM "Payment" r WHERE r."reversalOfId" IS NOT NULL AND (r."amountPyg" >= 0 OR NOT EXISTS (SELECT 1 FROM "Payment" o WHERE o."id" = r."reversalOfId" AND o."amountPyg" = -r."amountPyg"))`)), 0, 'toda reversión es el negativo exacto de su original')
igual(Number(sql(`SELECT COUNT(*) FROM "Order" o WHERE o."status" <> 'CANCELLED' AND EXISTS (SELECT 1 FROM "PaymentCorrection" c WHERE c."orderId" = o."id") AND (SELECT COALESCE(SUM("amountPyg"),0) FROM "Payment" WHERE "orderId" = o."id" AND "status" = 'CONFIRMED') > o."totalPyg"`)), 0, 'ningún pedido corregido cobra de más')

console.log(`Consumidores de pagos corregidos (#393-B): ${checks} checks OK`)
