#!/usr/bin/env node

// Verificación de pagos sobre HTTP real: el servidor decide el estado del cobro
// según la política de la empresa (el cliente no fuerza CONFIRMED), nadie aprueba
// su propio pago, aprobar/rechazar es idempotente y un pago resuelto no se reabre,
// la entrega se frena aunque el cliente tenga crédito, un pendiente nunca suma como
// cobrado, y la verificación diaria (lote por día/categoría/uno, diferencias).
//
// Uso: payment-verification.mjs <baseUrl> <adminToken> <sellerToken> <gerenteToken> <cajeraToken> <databaseUrl>

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

const [baseUrl, adminToken, sellerToken, gerenteToken, cajeraToken, databaseUrl] = process.argv.slice(2)
if (!baseUrl || !adminToken || !sellerToken || !gerenteToken || !cajeraToken || !databaseUrl) throw new Error('Uso: payment-verification.mjs <baseUrl> <adminToken> <sellerToken> <gerenteToken> <cajeraToken> <databaseUrl>')

const pgBin = process.env.MOBOS_TEST_PG_BIN || '/opt/homebrew/bin'
const psql = (sql) => execFileSync(join(pgBin, 'psql'), ['-X', '--no-psqlrc', '-At', '-v', 'ON_ERROR_STOP=1', databaseUrl, '-c', sql], { stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim()
const stamp = Date.now().toString(36)
let checks = 0

async function call(path, { method = 'GET', token = adminToken, body, headers = {}, raw } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'x-forwarded-for': '203.0.113.88', 'x-tenant-id': 'tenant-a-it', Authorization: `Bearer ${token}`, ...(body === undefined || raw ? {} : { 'Content-Type': 'application/json' }), ...headers },
    ...(raw ? { body: raw } : body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return { status: response.status, payload: await response.json().catch(() => null) }
}
const is = (actual, expected, message) => { assert.equal(actual, expected, message); checks++ }
const ok = (value, message) => { assert.ok(value, message); checks++ }

const originalSettings = psql(`SELECT COALESCE("settings", '{}'::jsonb)::text FROM "Tenant" WHERE "id" = 'tenant-a-it'`)
const setPolicy = (policy) => psql(`UPDATE "Tenant" SET "settings" = COALESCE("settings", '{}'::jsonb) || jsonb_build_object('paymentVerification', '${JSON.stringify(policy)}'::jsonb) WHERE "id" = 'tenant-a-it'`)
const POLICY = { methods: { CASH: 'auto', CARD: 'auto', PIX: 'verificar', CRYPTO: 'verificar', TRANSFER: 'verificar' }, accounts: {}, requireProof: true, blockDelivery: true, selfApproveRoles: [] }

const pdf = () => { const body = new FormData(); body.set('file', new Blob(['%PDF-1.4\n% comprobante sintético\n%%EOF'], { type: 'application/pdf' }), 'comprobante.pdf'); return body }
const uploadProof = (paymentId, token) => call(`/api/payments/${paymentId}/proofs`, { method: 'POST', token, raw: pdf() })
const dbStatus = (paymentId) => psql(`SELECT status::text FROM "Payment" WHERE "id" = '${paymentId}'`)
const audits = (action, entityId) => Number(psql(`SELECT COUNT(*) FROM "AuditLog" WHERE "tenantId" = 'tenant-a-it' AND action = '${action}' AND "entityId" = '${entityId}'`))

try {
  setPolicy(POLICY)
  let r = await call('/api/products', { method: 'POST', body: { sku: `PV-${stamp}`, name: 'Equipo verificación', pricePyg: 10000, stock: 200, branchId: 'branch-a-it' } })
  is(r.status, 201, JSON.stringify(r.payload))
  const product = r.payload
  const venta = (price, payments, extra = {}, token = sellerToken) => call('/api/orders', { method: 'POST', token, body: { items: [{ productId: product.id, description: product.name, quantity: 1, unitPricePyg: price }], payments, ...extra } })
  const nuevoCliente = async (nombre, extra = {}) => {
    const alta = await call('/api/customers', { method: 'POST', body: { name: `${nombre} ${stamp}`, phone: `5959${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`, ...extra } })
    is(alta.status, 201, JSON.stringify(alta.payload))
    return alta.payload
  }
  const resolver = (paymentId, state, note, token = gerenteToken) => call(`/api/payments/${paymentId}/reconciliation`, { method: 'PATCH', token, body: { state, ...(note === undefined ? {} : { note }) } })

  // ── 1) El cliente no fuerza CONFIRMED: PIX/transferencia nacen pendientes de verificación ──
  r = await venta(500000, [{ method: 'PIX', amountPyg: 500000, status: 'CONFIRMED', reference: `PIX-${stamp}-1` }])
  is(r.status, 201, JSON.stringify(r.payload))
  const pedidoPix = r.payload
  const pagoPix = pedidoPix.payments[0]
  is(pagoPix.status, 'PENDING', 'el servidor decide: PIX queda pendiente aunque el cliente mande CONFIRMED')
  is(pagoPix.pendingReason, 'VERIFICACION')
  is(pedidoPix.status, 'PENDING', 'el pedido no se cierra con un pago sin verificar')
  is(audits('PAYMENT_VERIFICATION_REQUESTED', pagoPix.id), 1, 'queda en la auditoría')
  // Efectivo y tarjeta siguen automáticos (la caja de efectivo no cambia).
  r = await venta(100000, [{ method: 'CASH', amountPyg: 100000, status: 'CONFIRMED' }])
  is(r.status, 201, JSON.stringify(r.payload))
  is(r.payload.payments[0].status, 'CONFIRMED')
  is(r.payload.payments[0].pendingReason, null)
  is(r.payload.status, 'COMPLETED')
  // Un cobro nuevo no nace rechazado ni devuelto.
  r = await venta(100000, [{ method: 'PIX', amountPyg: 100000, status: 'REJECTED' }])
  is(r.status, 400, 'no se crea un pago ya rechazado')
  // El POST /api/payments también decide por política.
  r = await venta(200000, [])
  is(r.status, 201, JSON.stringify(r.payload))
  const sinPago = r.payload
  r = await call('/api/payments', { method: 'POST', token: sellerToken, body: { orderId: sinPago.id, method: 'TRANSFER', amountPyg: 200000, status: 'CONFIRMED', reference: `TR-${stamp}` } })
  is(r.status, 201, JSON.stringify(r.payload))
  is(r.payload.status, 'PENDING')
  is(r.payload.pendingReason, 'VERIFICACION')
  const pagoTransf = r.payload
  // No se puede cobrar de más mientras hay un cobro esperando aprobación.
  r = await call('/api/payments', { method: 'POST', token: sellerToken, body: { orderId: sinPago.id, method: 'TRANSFER', amountPyg: 200000, reference: `TR-${stamp}-2` } })
  is(r.status, 409, 'el saldo cuenta lo que espera verificación')

  // ── 2) Un pendiente nunca suma como cobrado ──
  is(Number(psql(`SELECT COALESCE(SUM("amountPyg"), 0) FROM "Payment" WHERE "orderId" = '${pedidoPix.id}' AND status = 'CONFIRMED'`)), 0)
  r = await call(`/api/orders/${pedidoPix.id}`)
  is(r.payload.status, 'PENDING')

  // ── 3) Entrega bloqueada con un pago en verificación, aunque el cliente tenga crédito ──
  const conCredito = await nuevoCliente('Cliente con crédito PV', { creditLimitPyg: 50000000, creditDays: 30 })
  r = await venta(800000, [{ method: 'PIX', amountPyg: 800000 }], { customerId: conCredito.id })
  is(r.status, 201, JSON.stringify(r.payload))
  const bloqueado = r.payload
  for (const [token, quien] of [[sellerToken, 'vendedor'], [adminToken, 'administrador']]) {
    r = await call(`/api/orders/${bloqueado.id}`, { method: 'PATCH', token, body: { fulfillmentStatus: 'DELIVERED' } })
    is(r.status, 409, `${quien}: no se entrega con el pago en verificación`)
    ok(/Pago en verificación/.test(r.payload?.message || ''), `mensaje claro: ${JSON.stringify(r.payload)}`)
  }
  is(psql(`SELECT COALESCE("creditDays"::text, 'null') FROM "Order" WHERE "id" = '${bloqueado.id}'`), 'null', 'el PIX pendiente no se convirtió en silencio en venta a crédito')
  is(psql(`SELECT "fulfillmentStatus"::text FROM "Order" WHERE "id" = '${bloqueado.id}'`) === 'DELIVERED', false)

  // ── 4) Nadie aprueba su propio pago (tampoco el administrador); verificadores = gerente/admin/caja ──
  r = await venta(300000, [{ method: 'PIX', amountPyg: 300000 }], {}, adminToken)
  is(r.status, 201, JSON.stringify(r.payload))
  is(r.payload.payments[0].status, 'PENDING', 'ni el administrador se autoaprueba sin configuración')
  const pagoAdmin = r.payload.payments[0]
  r = await resolver(pagoAdmin.id, 'VERIFIED', undefined, adminToken)
  is(r.status, 403, 'el administrador no aprueba el pago que registró')
  r = await resolver(pagoPix.id, 'VERIFIED', undefined, sellerToken)
  is(r.status, 403, 'un vendedor no verifica')
  // Sin comprobante no se aprueba (requireProof).
  r = await resolver(pagoPix.id, 'VERIFIED')
  is(r.status, 409)
  ok(/comprobante/i.test(r.payload?.message || ''))
  r = await uploadProof(pagoPix.id, sellerToken)
  is(r.status, 201, JSON.stringify(r.payload))
  // Aprobar: CONFIRMED con paidAt = fecha de aprobación; cierra el pedido.
  const creado = psql(`SELECT EXTRACT(EPOCH FROM "paidAt")::bigint FROM "Payment" WHERE "id" = '${pagoPix.id}'`)
  await new Promise(resolve => setTimeout(resolve, 1100))
  r = await resolver(pagoPix.id, 'VERIFIED', 'Acreditado en el banco', cajeraToken)
  is(r.status, 200, JSON.stringify(r.payload))
  is(r.payload.state, 'VERIFIED')
  is(r.payload.resolvedVia, 'PANEL')
  is(dbStatus(pagoPix.id), 'CONFIRMED')
  ok(Number(psql(`SELECT EXTRACT(EPOCH FROM "paidAt")::bigint FROM "Payment" WHERE "id" = '${pagoPix.id}'`)) > Number(creado), 'paidAt = fecha de aprobación')
  is(psql(`SELECT status::text FROM "Order" WHERE "id" = '${pedidoPix.id}'`), 'COMPLETED')
  is(audits('PAYMENT_CONFIRMED', pagoPix.id), 1)
  // Doble aprobación = no-op 200 (sin segunda auditoría); cambiar un pago resuelto = 409.
  r = await resolver(pagoPix.id, 'VERIFIED')
  is(r.status, 200, 'misma resolución: no-op')
  is(audits('PAYMENT_CONFIRMED', pagoPix.id), 1, 'el no-op no repite la auditoría')
  r = await resolver(pagoPix.id, 'REJECTED', 'me arrepentí')
  is(r.status, 409, 'un pago aprobado no se rechaza')
  is(dbStatus(pagoPix.id), 'CONFIRMED')
  // Sin cambios de medio sobre un pago pendiente (#393): se resuelve primero la verificación.
  r = await call('/api/payments/pagos-inexistente/reconciliation', { method: 'PATCH', token: gerenteToken, body: { state: 'VERIFIED' } })
  is(r.status, 404)

  // ── 5) Rechazar exige motivo; un rechazado deja el saldo abierto y se puede cobrar de nuevo ──
  r = await resolver(pagoTransf.id, 'REJECTED')
  is(r.status, 400, 'rechazar sin motivo')
  r = await resolver(pagoTransf.id, 'REJECTED', 'La transferencia no llegó')
  is(r.status, 200, JSON.stringify(r.payload))
  is(dbStatus(pagoTransf.id), 'REJECTED')
  is(audits('PAYMENT_REJECTED', pagoTransf.id), 1)
  r = await resolver(pagoTransf.id, 'REJECTED', 'La transferencia no llegó')
  is(r.status, 200, 'mismo rechazo: no-op')
  r = await resolver(pagoTransf.id, 'VERIFIED')
  is(r.status, 409, 'un pago rechazado no se reabre')
  is(psql(`SELECT status::text FROM "Order" WHERE "id" = '${sinPago.id}'`), 'PENDING', 'el rechazo deja el saldo abierto')
  r = await call('/api/payments', { method: 'POST', token: sellerToken, body: { orderId: sinPago.id, method: 'CASH', amountPyg: 200000 } })
  is(r.status, 201, JSON.stringify(r.payload))
  is(psql(`SELECT status::text FROM "Order" WHERE "id" = '${sinPago.id}'`), 'COMPLETED', 'sin doble conteo: solo el efectivo cuenta')
  is(Number(psql(`SELECT COALESCE(SUM("amountPyg"), 0) FROM "Payment" WHERE "orderId" = '${sinPago.id}' AND status = 'CONFIRMED'`)), 200000)

  // ── 6) Listado GET /api/payments/verification ──
  r = await call('/api/payments/verification?state=pending', { token: gerenteToken })
  is(r.status, 200, JSON.stringify(r.payload))
  ok(r.payload.items.some(item => item.id === pagoAdmin.id && item.orderNumber && item.canResolve === true), 'el gerente ve y puede resolver el pago del administrador')
  ok(r.payload.counts.pending.count >= 2)
  r = await call('/api/payments/verification?state=pending', { token: adminToken })
  is(r.payload.items.find(item => item.id === pagoAdmin.id)?.canResolve, false, 'el administrador ve su pago pero no lo puede aprobar')
  r = await call('/api/payments/verification?state=rejected', { token: cajeraToken })
  const rechazado = r.payload.items.find(item => item.id === pagoTransf.id)
  is(rechazado?.resolution?.note, 'La transferencia no llegó')
  r = await call('/api/payments/verification?state=approved', { token: gerenteToken })
  ok(r.payload.items.some(item => item.id === pagoPix.id && item.resolution?.byName))
  r = await call('/api/payments/verification?state=pending', { token: sellerToken })
  is(r.status, 200)
  ok(r.payload.items.length > 0 && r.payload.items.every(item => item.sellerId === 'user-a-it' && item.canResolve === false), 'el vendedor solo ve los suyos y no resuelve')
  r = await call('/api/payments/verification?state=pending', { token: '' })
  is(r.status, 401)
  r = await call('/api/payments/verification?state=cualquiera', { token: gerenteToken })
  is(r.status, 400)

  // ── 7) selfApproveRoles: el rol autorizado se aprueba solo y queda auditado como SELF ──
  setPolicy({ ...POLICY, selfApproveRoles: ['ADMIN'] })
  r = await venta(250000, [{ method: 'PIX', amountPyg: 250000 }], {}, adminToken)
  is(r.status, 201, JSON.stringify(r.payload))
  is(r.payload.payments[0].status, 'CONFIRMED', 'rol en selfApproveRoles: queda aprobado')
  is(psql(`SELECT "resolvedVia" FROM "PaymentReconciliation" WHERE "paymentId" = '${r.payload.payments[0].id}'`), 'SELF')
  is(audits('PAYMENT_SELF_APPROVED', r.payload.payments[0].id), 1)
  r = await venta(250000, [{ method: 'PIX', amountPyg: 250000 }])
  is(r.payload.payments[0].status, 'PENDING', 'el vendedor sigue en verificación')
  setPolicy(POLICY)

  // ── 8) Verificación diaria ──
  const hoy = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10)
  r = await call('/api/payment-accounts', { method: 'POST', body: { name: `Transferencia día ${stamp}`, kind: 'TRANSFER', currency: 'PYG', bank: 'Banco sintético', holder: 'Empresa prueba', accountNumber: `DIA-${stamp}` } })
  is(r.status, 201, JSON.stringify(r.payload))
  const cuenta = r.payload
  const transferencia = (price, token = sellerToken) => venta(price, [{ accountId: cuenta.id, originalAmount: String(price), exchangeRatePyg: '1', amountPyg: price, method: 'TRANSFER' }], {}, token)
  const t1 = (await transferencia(400000)).payload.payments[0]
  const t2 = (await transferencia(150000)).payload.payments[0]
  const tAdmin = (await transferencia(90000, adminToken)).payload.payments[0]
  for (const pago of [t1, t2, tAdmin]) is(pago.status, 'PENDING')
  const dia = (query = '', token = gerenteToken) => call(`/api/payments/verification/daily?day=${hoy}${query}`, { token })
  const accion = (body, token = gerenteToken) => call('/api/payments/verification/daily', { method: 'POST', token, body: { day: hoy, branchId: 'branch-a-it', ...body } })
  r = await call('/api/payments/verification/daily', { token: sellerToken })
  is(r.status, 403, 'el vendedor no entra a la verificación diaria')
  r = await call(`/api/payments/verification/daily?day=${hoy}`, { token: '' })
  is(r.status, 401)
  r = await dia('&branchId=branch-a2-it')
  is(r.status, 200, 'el gerente de sucursal ve la suya (ignora el branchId pedido)')
  r = await dia()
  is(r.status, 200, JSON.stringify(r.payload))
  const categoria = r.payload.groups.find(grupo => grupo.accountId === cuenta.id)
  is(categoria.count, 3)
  is(categoria.pendingCount, 3)
  is(categoria.confirmedPyg, 0, 'lo pendiente no suma como ingresado')
  is(categoria.pendingPyg, 640000)
  const linea = categoria.payments.find(item => item.id === t1.id)
  ok(linea.orderNumber && linea.customerName === null && linea.collectedByName === 'Seller A' && linea.at, 'detalle por pedido: número, monto, cliente, cobrado por y hora')
  is(r.payload.state, 'OPEN')
  // Verificar uno: sin comprobante no se aprueba; el propio no se verifica.
  r = await accion({ action: 'verify-one', paymentId: t1.id })
  is(r.status, 409)
  ok(/comprobante/i.test(r.payload?.message || ''))
  for (const pago of [t1, t2, tAdmin]) is((await uploadProof(pago.id, pago === tAdmin ? adminToken : sellerToken)).status, 201)
  r = await accion({ action: 'verify-one', paymentId: tAdmin.id }, adminToken)
  is(r.status, 403, 'el administrador no verifica el pago propio')
  r = await accion({ action: 'verify-one', paymentId: t1.id })
  is(r.status, 200, JSON.stringify(r.payload))
  is(r.payload.result.verified, 1)
  is(dbStatus(t1.id), 'CONFIRMED')
  r = await accion({ action: 'verify-one', paymentId: t1.id })
  is(r.payload.result.verified, 0, 'idempotente: uno ya verificado no se vuelve a aprobar')
  is(r.payload.result.alreadyVerified, 1)
  is(audits('PAYMENT_CONFIRMED', t1.id), 1)
  r = await accion({ action: 'verify-one', paymentId: 'no-existe' })
  is(r.status, 404)
  // Diferencias: por línea y por categoría, con motivo; estado del día.
  r = await accion({ action: 'discrepancy', scope: 'LINE', paymentId: t2.id, receivedPyg: 140000 })
  is(r.status, 400, 'la diferencia exige motivo')
  r = await accion({ action: 'discrepancy', scope: 'LINE', paymentId: t2.id, receivedPyg: 150000, reason: 'igual' })
  is(r.status, 400, 'recibido igual a esperado no es diferencia')
  const requestId = `disc-${stamp}-1`
  r = await accion({ action: 'discrepancy', scope: 'LINE', paymentId: t2.id, receivedPyg: 140000, reason: 'El banco descontó comisión', requestId })
  is(r.status, 201, JSON.stringify(r.payload))
  is(r.payload.discrepancy.expectedPyg, 150000)
  is(r.payload.discrepancy.receivedPyg, 140000)
  const discrepancyId = r.payload.discrepancy.id
  r = await accion({ action: 'discrepancy', scope: 'LINE', paymentId: t2.id, receivedPyg: 140000, reason: 'El banco descontó comisión', requestId })
  is(r.status, 200, 'reintento con el mismo requestId: no duplica')
  is(r.payload.created, false)
  is(Number(psql(`SELECT COUNT(*) FROM "PaymentVerificationDiscrepancy" WHERE "tenantId" = 'tenant-a-it' AND "paymentId" = '${t2.id}'`)), 1)
  r = await accion({ action: 'discrepancy', scope: 'CATEGORY', method: 'TRANSFER', accountId: cuenta.id, receivedPyg: 399000, reason: 'Faltó un depósito' })
  is(r.status, 201, JSON.stringify(r.payload))
  is(r.payload.discrepancy.expectedPyg, 400000, 'esperado de la categoría = lo ya aprobado')
  r = await dia()
  is(r.payload.state, 'DISCREPANCIES')
  is(r.payload.openDiscrepancies, 2)
  ok(r.payload.discrepancies.every(item => item.createdByName === 'Gerente A' && item.reason))
  // Verificar la categoría (los pagos propios del verificador se saltean; el resto se aprueba).
  r = await accion({ action: 'verify-category', method: 'TRANSFER', accountId: cuenta.id })
  is(r.status, 200, JSON.stringify(r.payload))
  is(r.payload.result.verified, 2, 't2 y el del administrador (lo verifica el gerente)')
  is(dbStatus(t2.id), 'CONFIRMED')
  is(dbStatus(tAdmin.id), 'CONFIRMED')
  r = await accion({ action: 'verify-category', method: 'TRANSFER', accountId: cuenta.id })
  is(r.payload.result.attempted, 0, 'repetir el lote no hace nada')
  r = await accion({ action: 'verify-all' })
  is(r.status, 200, JSON.stringify(r.payload))
  const repetido = await accion({ action: 'verify-all' })
  is(repetido.payload.result.verified, 0, 'verificar todos es idempotente')
  r = await accion({ action: 'resolve-discrepancy', discrepancyId })
  is(r.status, 200)
  r = await accion({ action: 'resolve-discrepancy', discrepancyId })
  is(r.payload.resolved, false, 'resolver dos veces no repite')
  r = await dia()
  is(r.payload.openDiscrepancies, 1)
  r = await accion({ action: 'resolve-discrepancy', discrepancyId: (r.payload.discrepancies.find(item => !item.resolved)).id, note: 'Revisado con el banco' })
  is(r.status, 200)
  r = await accion({ action: 'inventada' })
  is(r.status, 400)
  const final = (await dia()).payload
  is(final.openDiscrepancies, 0)
  const categoriaFinal = final.groups.find(grupo => grupo.accountId === cuenta.id)
  is(categoriaFinal.confirmedPyg, 640000)
  is(categoriaFinal.verifiedCount, 3)

  // El vendedor y la caja de otra empresa no ven nada: tenant aislado.
  is(Number(psql(`SELECT COUNT(*) FROM "PaymentVerificationDiscrepancy" WHERE "tenantId" <> 'tenant-a-it'`)), 0)

  // ── 9) Cuota cobrada por un medio «a verificar» y RECHAZADA: vuelve a quedar pendiente ──
  // Regresión: la cuota desaparecía (REJECTED) y la deuda quedaba abierta sin cuota.
  const clienteCuotas = await nuevoCliente('Cliente cuotas PV')
  r = await venta(120000, [], { customerId: clienteCuotas.id })
  is(r.status, 201, JSON.stringify(r.payload))
  const pedidoCuotas = r.payload
  const vence = new Date(Date.now() + 5 * 86400000).toISOString()
  r = await call(`/api/orders/${pedidoCuotas.id}/installments`, { method: 'POST', body: { count: 3, firstDueAt: vence } })
  is(r.status, 201, JSON.stringify(r.payload))
  const cuotasPlan = r.payload.payments
  const cuota1 = cuotasPlan[0]
  const dueOriginal = psql(`SELECT "dueAt"::text FROM "Payment" WHERE "id" = '${cuota1.id}'`)
  r = await call('/api/payments', { method: 'POST', token: sellerToken, body: { orderId: pedidoCuotas.id, method: 'PIX', amountPyg: cuota1.amountPyg, installmentId: cuota1.id, reference: `PIX-CUOTA-${stamp}` } })
  is(r.status, 201, JSON.stringify(r.payload))
  is(r.payload.status, 'PENDING', 'la cuota cobrada por PIX espera verificación')
  is(r.payload.pendingReason, 'VERIFICACION')
  r = await resolver(cuota1.id, 'REJECTED', 'No ingresó el PIX')
  is(r.status, 200, JSON.stringify(r.payload))
  is(dbStatus(cuota1.id), 'REJECTED', 'el intento queda rechazado')
  is(psql(`SELECT ("dueAt" IS NULL)::text FROM "Payment" WHERE "id" = '${cuota1.id}'`), 'true', 'el intento rechazado ya no es una cuota')
  // La cuota vuelve: PENDING/CREDIT/CUOTA, mismo monto y vencimiento original; sin duplicar ni perder montos.
  const restauradas = psql(`SELECT "id" || '|' || "status"::text || '|' || "method"::text || '|' || "pendingReason" || '|' || "amountPyg" || '|' || "dueAt"::text FROM "Payment" WHERE "orderId" = '${pedidoCuotas.id}' AND "status" = 'PENDING' AND "method" = 'CREDIT' AND "id" <> ALL (ARRAY['${cuotasPlan[1].id}', '${cuotasPlan[2].id}']) `).split('\n').filter(Boolean)
  is(restauradas.length, 1, 'exactamente una cuota nueva en lugar de la rechazada')
  const [nuevaId, , , razon, monto, vencimiento] = restauradas[0].split('|')
  is(razon, 'CUOTA')
  is(Number(monto), cuota1.amountPyg, 'mismo monto')
  is(vencimiento, dueOriginal, 'vencimiento original')
  is(Number(psql(`SELECT COALESCE(SUM("amountPyg"), 0) FROM "Payment" WHERE "orderId" = '${pedidoCuotas.id}' AND "dueAt" IS NOT NULL AND "status" = 'PENDING'`)), 120000, 'las cuotas pendientes siguen sumando el saldo completo')
  is(Number(psql(`SELECT COALESCE(SUM("amountPyg"), 0) FROM "Payment" WHERE "orderId" = '${pedidoCuotas.id}' AND "status" = 'CONFIRMED'`)), 0, 'el rechazado no cuenta como cobrado')
  is(audits('CREDIT_INSTALLMENT_RESTORED', cuota1.id), 1, 'queda auditado')
  // Rechazar de nuevo es un no-op: no crea otra cuota.
  r = await resolver(cuota1.id, 'REJECTED', 'No ingresó el PIX')
  is(r.status, 200)
  is(Number(psql(`SELECT COUNT(*) FROM "Payment" WHERE "orderId" = '${pedidoCuotas.id}' AND "status" = 'PENDING' AND "method" = 'CREDIT'`)), 3, 'sigue habiendo 3 cuotas pendientes')
  // El aviso al vendedor dice que la cuota quedó pendiente.
  r = await call('/api/notifications', { token: sellerToken })
  is(r.status, 200, JSON.stringify(r.payload))
  const aviso = (r.payload.items || r.payload.notifications || []).find(item => item.id === `pago-resuelto-${cuota1.id}`)
  ok(aviso, 'el vendedor recibe el aviso del rechazo')
  ok(/la cuota volvió a quedar pendiente/.test(aviso.detail), `el aviso indica la cuota: ${aviso?.detail}`)
  // La cuota restaurada se puede cobrar de nuevo (efectivo) y cierra bien.
  r = await call('/api/payments', { method: 'POST', token: sellerToken, body: { orderId: pedidoCuotas.id, method: 'CASH', amountPyg: cuota1.amountPyg, installmentId: nuevaId } })
  is(r.status, 201, JSON.stringify(r.payload))
  is(r.payload.status, 'CONFIRMED')
  is(r.payload.id, nuevaId)

  console.log(`payment-verification: ${checks} comprobaciones OK`)
} finally {
  psql(`UPDATE "Tenant" SET "settings" = '${originalSettings.replace(/'/g, "''")}'::jsonb WHERE "id" = 'tenant-a-it'`)
}
