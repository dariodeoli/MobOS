#!/usr/bin/env node

// Crédito sobre el límite sobre HTTP real: una venta a crédito que supera el
// crédito disponible (límite − deuda abierta) NO se entrega hasta que un
// administrador o gerente la autoriza. Cubre: pedido «pendiente de autorización»
// con stock reservado, campana de administración, aprobación solo de
// administración/gerencia (sesión o PIN), auditoría, rechazo, cliente sin
// crédito, dos ventas simultáneas y el control al entregar con saldo.
//
// Uso: credito-autorizacion.mjs <baseUrl> <adminToken> <sellerToken> <gerenteToken> <cajeraToken> <databaseUrl>

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import bcrypt from 'bcryptjs'

const [baseUrl, adminToken, sellerToken, gerenteToken, cajeraToken, databaseUrl] = process.argv.slice(2)
if (!baseUrl || !adminToken || !sellerToken || !gerenteToken || !cajeraToken || !databaseUrl) throw new Error('Uso: credito-autorizacion.mjs <baseUrl> <adminToken> <sellerToken> <gerenteToken> <cajeraToken> <databaseUrl>')

const pgBin = process.env.MOBOS_TEST_PG_BIN || '/opt/homebrew/bin'
const psql = (sql) => execFileSync(join(pgBin, 'psql'), ['-X', '--no-psqlrc', '-At', '-v', 'ON_ERROR_STOP=1', databaseUrl, '-c', sql], { stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim()

const stamp = Date.now().toString(36)
// Configuración de la empresa: se restaura al final. Nadie aprueba lo propio salvo los roles de selfApproveRoles.
const settingsOriginal = psql(`SELECT COALESCE("settings", '{}'::jsonb)::text FROM "Tenant" WHERE "id" = 'tenant-a-it'`)
const mergeSettings = (value) => psql(`UPDATE "Tenant" SET "settings" = COALESCE("settings", '{}'::jsonb) || '${JSON.stringify(value)}'::jsonb WHERE "id" = 'tenant-a-it'`)
const setSelfApprove = (roles) => mergeSettings({ paymentVerification: { methods: {}, selfApproveRoles: roles } })
async function call(path, { method = 'GET', token = adminToken, body, headers = {} } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'x-forwarded-for': '203.0.113.77', 'x-tenant-id': 'tenant-a-it', Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return { status: response.status, payload: await response.json().catch(() => null) }
}

// El arnés siembra al gerente con el mismo PIN que el administrador (PIN
// repetido = ambiguo). Para probar la aprobación por PIN el gerente usa uno propio.
const PIN_GERENTE = '60417'
const hashOriginal = psql(`SELECT "pinHash" FROM "User" WHERE "id" = 'user-gerente-it'`)
const hashNuevo = await bcrypt.hash(PIN_GERENTE, 10)
psql(`UPDATE "User" SET "pinHash" = '${hashNuevo}' WHERE "id" = 'user-gerente-it'`)

try {
  // Producto con stock propio para no pelear con otros ensayos.
  let r = await call('/api/products', { method: 'POST', body: { sku: `CRED-AUT-${stamp}`, name: 'Equipo crédito autorizado', pricePyg: 10000, stock: 60, branchId: 'branch-a-it' } })
  assert.equal(r.status, 201, JSON.stringify(r.payload))
  const product = r.payload
  const linea = (price, quantity = 1) => ({ productId: product.id, description: 'Equipo crédito autorizado', quantity, unitPricePyg: price })
  const venta = (customerId, price, extra = {}, token = sellerToken) => call('/api/orders', { method: 'POST', token, body: { customerId, items: [linea(price)], payments: [], ...extra } })
  const nuevoCliente = async (nombre, extra = {}) => {
    const alta = await call('/api/customers', { method: 'POST', body: { name: `${nombre} ${stamp}`, phone: `5959${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`, ...extra } })
    assert.equal(alta.status, 201, JSON.stringify(alta.payload))
    return alta.payload
  }
  const stockDe = async () => Number(psql(`SELECT stock FROM "Product" WHERE "id" = '${product.id}'`))

  // ── 1) Caso reportado: límite 2.000.000, deuda 1.500.000 → 500.000 disponibles ──
  const lucia = await nuevoCliente('Lucía Crédito', { creditLimitPyg: 2000000, creditDays: 15 })
  r = await venta(lucia.id, 1500000, { creditDays: 15 })
  assert.equal(r.status, 201, JSON.stringify(r.payload))
  assert.equal(r.payload.creditAuthorization, null, 'dentro del límite la venta a crédito no pide autorización')
  const deudaInicial = r.payload

  const stockAntes = await stockDe()
  r = await venta(lucia.id, 4850000, { creditDays: 15 })
  assert.equal(r.status, 201, JSON.stringify(r.payload))
  const retenido = r.payload
  assert.equal(retenido.status, 'PENDING')
  assert.equal(retenido.fulfillmentStatus, 'PROCESSING', 'no se entrega ni se marca como retirado al crear')
  assert.equal(retenido.creditAuthorization?.status, 'PENDING')
  assert.equal(retenido.creditAuthorization?.overPyg, 4350000, 'monto sobre el límite = deuda 1.500.000 + 4.850.000 − límite 2.000.000')
  assert.equal(retenido.creditAuthorization?.availablePyg, 500000)
  assert.equal(await stockDe(), stockAntes - 1, 'las unidades quedan reservadas por el pedido retenido')

  // El listado y el detalle exponen el estado.
  r = await call(`/api/orders/${retenido.id}`)
  assert.equal(r.payload.creditAuthorization?.status, 'PENDING')
  r = await call('/api/orders?filtro=todos&limit=100')
  assert.equal(r.payload.find((o) => o.id === retenido.id)?.creditAuthorization?.status, 'PENDING')

  // No se puede entregar mientras esté pendiente: ni el vendedor ni el administrador.
  for (const [token, quien] of [[sellerToken, 'vendedor'], [adminToken, 'administrador']]) {
    r = await call(`/api/orders/${retenido.id}`, { method: 'PATCH', token, body: { fulfillmentStatus: 'DELIVERED' } })
    assert.equal(r.status, 409, `${quien}: ${JSON.stringify(r.payload)}`)
    assert.match(String(r.payload?.message), /Pendiente de autorización de crédito/)
  }

  // Campana del administrador: nombre del cliente y monto, con enlace al pedido.
  r = await call('/api/notifications?limit=60')
  assert.equal(r.status, 200)
  const aviso = (r.payload.items || r.payload).find((n) => n.href === `/pedidos/${retenido.id}` && /Autorizar entrega a crédito/.test(n.title))
  assert.ok(aviso, `la campana del administrador avisa: ${JSON.stringify(r.payload).slice(0, 400)}`)
  assert.match(aviso.detail, new RegExp(lucia.name))
  assert.match(aviso.detail, /4\.350\.000/)

  // Aprobar: el vendedor sin PIN y la cajera no pueden; un PIN incorrecto tampoco.
  r = await call(`/api/orders/${retenido.id}/credit-authorization`, { method: 'POST', token: sellerToken, body: { action: 'approve' } })
  assert.equal(r.status, 403, 'un vendedor no aprueba su propia venta')
  r = await call(`/api/orders/${retenido.id}/credit-authorization`, { method: 'POST', token: cajeraToken, body: { action: 'approve' } })
  assert.equal(r.status, 403, 'la cajera tampoco')
  r = await call(`/api/orders/${retenido.id}/credit-authorization`, { method: 'POST', token: sellerToken, body: { action: 'approve', pin: '1111' } })
  assert.equal(r.status, 403, 'PIN incorrecto')
  // La solicitud genérica de «Autorizaciones» no deja pedir esta autorización a mano.
  r = await call('/api/authorizations', { method: 'POST', token: sellerToken, body: { kind: 'ORDER_CREDIT_OVER', customerId: lucia.id } })
  assert.equal(r.status, 400)
  r = await call(`/api/orders/${retenido.id}`)
  assert.equal(r.payload.creditAuthorization?.status, 'PENDING', 'sigue pendiente')

  // Aprobación con el PIN del gerente desde la sesión del vendedor (en el mostrador).
  r = await call(`/api/orders/${retenido.id}/credit-authorization`, { method: 'POST', token: sellerToken, body: { action: 'approve', pin: PIN_GERENTE } })
  assert.equal(r.status, 200, JSON.stringify(r.payload))
  assert.equal(r.payload.creditAuthorization?.status, 'APPROVED')
  assert.equal(r.payload.creditAuthorization?.resolvedByName, 'Gerente A')
  const auditoria = psql(`SELECT "userId" || '|' || (metadata->>'overPyg') || '|' || (metadata->>'via') || '|' || (metadata->>'performedById') || '|' || (metadata->>'approverName') FROM "AuditLog" WHERE "tenantId" = 'tenant-a-it' AND action = 'ORDER_CREDIT_AUTHORIZED' AND "entityId" = '${retenido.id}'`)
  assert.equal(auditoria, 'user-gerente-it|4350000|PIN|user-a-it|Gerente A', 'quién aprobó, monto sobre el límite y por qué vía')
  r = await call(`/api/orders/${retenido.id}/credit-authorization`, { method: 'POST', token: adminToken, body: { action: 'approve' } })
  assert.equal(r.status, 409, 'una autorización resuelta no se resuelve dos veces')
  // Ya aprobada: se puede entregar.
  r = await call(`/api/orders/${retenido.id}`, { method: 'PATCH', token: adminToken, body: { fulfillmentStatus: 'DELIVERED' } })
  assert.equal(r.status, 200, JSON.stringify(r.payload))
  assert.equal(r.payload.fulfillmentStatus, 'DELIVERED')

  // ── 2) Rechazo: sigue sin entregarse ─────────────────────────────────────────
  r = await venta(lucia.id, 900000, { creditDays: 15 })
  assert.equal(r.status, 201, JSON.stringify(r.payload))
  const aRechazar = r.payload
  assert.equal(aRechazar.creditAuthorization?.status, 'PENDING')
  r = await call(`/api/orders/${aRechazar.id}/credit-authorization`, { method: 'POST', token: gerenteToken, body: { action: 'reject' } })
  assert.equal(r.status, 400, 'el rechazo exige motivo')
  r = await call(`/api/orders/${aRechazar.id}/credit-authorization`, { method: 'POST', token: gerenteToken, body: { action: 'reject', note: 'Debe tres facturas vencidas' } })
  assert.equal(r.status, 200, JSON.stringify(r.payload))
  assert.equal(r.payload.creditAuthorization?.status, 'REJECTED')
  r = await call(`/api/orders/${aRechazar.id}`, { method: 'PATCH', token: adminToken, body: { fulfillmentStatus: 'DELIVERED' } })
  assert.equal(r.status, 409)
  assert.match(String(r.payload?.message), /Rechazado — anulá el pedido o pedí una nueva autorización/)
  // También se resuelve desde «Autorizaciones» (misma regla) y aprueba el dueño.
  r = await call(`/api/orders/${aRechazar.id}/credit-authorization`, { method: 'POST', token: sellerToken, body: { action: 'request' } })
  assert.equal(r.status, 201, 'tras un rechazo el vendedor puede volver a pedirla')
  const reabierta = r.payload.creditAuthorization
  assert.equal(reabierta.status, 'PENDING')
  r = await call('/api/authorizations?status=PENDING&kind=ORDER_CREDIT_OVER')
  assert.ok(r.payload.some((a) => a.id === reabierta.id), 'aparece en Autorizaciones')
  r = await call('/api/authorizations', { method: 'PATCH', body: { id: reabierta.id, action: 'approve' } })
  assert.equal(r.status, 200, JSON.stringify(r.payload))
  r = await call(`/api/orders/${aRechazar.id}`)
  assert.equal(r.payload.creditAuthorization?.status, 'APPROVED')

  // ── 3) Cliente con crédito 0 / sin límite: sin pase libre ────────────────────
  const sinLimite = await nuevoCliente('Sin Límite')
  r = await venta(sinLimite.id, 14800, {}, adminToken)  // deuda de 14.800 sin plazo de crédito
  assert.equal(r.status, 201, JSON.stringify(r.payload))
  r = await venta(sinLimite.id, 300000, { creditDays: 10 })
  assert.equal(r.status, 201, JSON.stringify(r.payload))
  assert.equal(r.payload.creditAuthorization?.status, 'PENDING', 'sin límite configurado la venta a crédito pide autorización')
  assert.equal(r.payload.creditAuthorization?.availablePyg, 0)
  assert.equal(r.payload.fulfillmentStatus, 'PROCESSING')
  const credito0 = await nuevoCliente('Crédito Cero', { creditLimitPyg: 0, creditDays: 30 })
  r = await venta(credito0.id, 100000, { creditDays: 30 })
  assert.equal(r.payload.creditAuthorization?.status, 'PENDING')
  // Una venta cobrada entera no usa crédito: sin autorización aunque el cliente no tenga.
  r = await venta(credito0.id, 100000, { creditDays: 30, payments: [{ method: 'CASH', amountPyg: 100000 }] })
  assert.equal(r.status, 201, JSON.stringify(r.payload))
  assert.equal(r.payload.creditAuthorization, null)
  assert.equal(r.payload.status, 'COMPLETED')

  // ── 4) Autorización en el mostrador al crear (PIN / dueño) ───────────────────
  const mostrador = await nuevoCliente('Mostrador', { creditLimitPyg: 100000, creditDays: 7 })
  r = await venta(mostrador.id, 600000, { creditDays: 7, creditApprovalPin: '0000' })
  assert.equal(r.status, 403, 'PIN incorrecto: la venta no se crea')
  r = await venta(mostrador.id, 600000, { creditDays: 7, creditSelfApproval: true })
  assert.equal(r.status, 403, 'un vendedor no se autoriza solo')
  r = await venta(mostrador.id, 600000, { creditDays: 7, creditApprovalPin: PIN_GERENTE })
  assert.equal(r.status, 201, JSON.stringify(r.payload))
  assert.equal(r.payload.creditAuthorization?.status, 'APPROVED')
  assert.equal(r.payload.creditAuthorization?.resolvedByName, 'Gerente A')
  assert.equal(r.payload.fulfillmentStatus, 'PROCESSING', 'aprobar el crédito no entrega: la entrega se confirma aparte')
  // Nadie aprueba lo propio, tampoco el administrador, salvo que la empresa lo autorice (selfApproveRoles).
  r = await venta(mostrador.id, 600000, { creditDays: 7, creditSelfApproval: true }, adminToken)
  assert.equal(r.status, 403, 'el administrador tampoco se autoriza solo sin configuración')
  setSelfApprove(['ADMIN'])
  r = await venta(mostrador.id, 600000, { creditDays: 7, creditSelfApproval: true }, adminToken)
  assert.equal(r.status, 201, JSON.stringify(r.payload))
  assert.equal(r.payload.creditAuthorization?.status, 'APPROVED')
  assert.equal(psql(`SELECT metadata->>'via' FROM "AuditLog" WHERE action = 'ORDER_CREDIT_AUTHORIZED' AND "entityId" = '${r.payload.id}'`), 'POS')

  // ── 5) Dos ventas a crédito simultáneas no pueden pasar ambas el límite ──────
  const carrera = await nuevoCliente('Carrera', { creditLimitPyg: 1000000, creditDays: 15 })
  const pares = await Promise.all([venta(carrera.id, 700000, { creditDays: 15 }), venta(carrera.id, 700000, { creditDays: 15 }, adminToken)])
  assert.deepEqual(pares.map((p) => p.status), [201, 201])
  const estados = pares.map((p) => p.payload.creditAuthorization?.status ?? 'LIBRE').sort()
  assert.deepEqual(estados, ['LIBRE', 'PENDING'], `una sola pasa el límite: ${estados.join(',')}`)

  // ── 6) Entregar con saldo a un cliente con crédito vuelve a controlar el límite ─
  const viejo = await nuevoCliente('Entrega Saldo', { creditLimitPyg: 1000000, creditDays: 20 })
  r = await venta(viejo.id, 1200000)  // sin marca de crédito: queda pendiente de cobro
  assert.equal(r.status, 201, JSON.stringify(r.payload))
  assert.equal(r.payload.creditAuthorization, null)
  const sinMarca = r.payload
  r = await call(`/api/orders/${sinMarca.id}`, { method: 'PATCH', token: adminToken, body: { fulfillmentStatus: 'DELIVERED' } })
  assert.equal(r.status, 409, 'entregar con saldo que supera el crédito exige autorización')
  assert.match(String(r.payload?.message), /superaría el crédito/)
  r = await call(`/api/orders/${sinMarca.id}/credit-authorization`, { method: 'POST', token: sellerToken, body: { action: 'request' } })
  assert.equal(r.status, 201, JSON.stringify(r.payload))
  r = await call(`/api/orders/${sinMarca.id}/credit-authorization`, { method: 'POST', token: adminToken, body: { action: 'approve' } })
  assert.equal(r.status, 200, JSON.stringify(r.payload))
  r = await call(`/api/orders/${sinMarca.id}`, { method: 'PATCH', token: adminToken, body: { fulfillmentStatus: 'DELIVERED' } })
  assert.equal(r.status, 200, JSON.stringify(r.payload))

  // ── 6b) Entregas simultáneas del mismo cliente: control y estado en UNA transacción ─
  // Límite 1.000.000, dos pedidos de 800.000 sin marca de crédito. Cada entrega
  // ve el otro pedido como deuda abierta: nunca pueden salir los dos.
  const doble = await nuevoCliente('Entrega Doble', { creditLimitPyg: 1000000, creditDays: 20 })
  const pedidosDobles = []
  for (let i = 0; i < 2; i += 1) {
    r = await venta(doble.id, 800000)
    assert.equal(r.status, 201, JSON.stringify(r.payload))
    pedidosDobles.push(r.payload)
  }
  const entregas = await Promise.all(pedidosDobles.map((p) => call(`/api/orders/${p.id}`, { method: 'PATCH', token: adminToken, body: { fulfillmentStatus: 'DELIVERED' } })))
  const pasaron = entregas.filter((e) => e.status === 200).length
  assert.ok(pasaron <= 1, `solo una entrega puede pasar el límite: ${entregas.map((e) => e.status).join(',')}`)
  for (const e of entregas.filter((x) => x.status !== 200)) {
    assert.equal(e.status, 409, JSON.stringify(e.payload))
    assert.match(String(e.payload?.message), /superaría el crédito/)
  }
  // Mismo control por el reparto no deja pasar lo retenido (ver estado del que quedó sin entregar).
  const sinEntregar = pedidosDobles.filter((_, i) => entregas[i].status !== 200)
  for (const p of sinEntregar) assert.equal(psql(`SELECT "fulfillmentStatus" FROM "Order" WHERE "id" = '${p.id}'`), 'PROCESSING', 'si el control falla el estado no cambia')

  // ── 6c) Un pedido rechazado no consume crédito disponible ─────────────────────
  const rechazador = await nuevoCliente('Rechazado Libera', { creditLimitPyg: 1000000, creditDays: 15 })
  r = await venta(rechazador.id, 900000, { creditDays: 15 })
  assert.equal(r.payload.creditAuthorization, null)
  r = await venta(rechazador.id, 900000, { creditDays: 15 })
  assert.equal(r.payload.creditAuthorization?.status, 'PENDING')
  const rechazado = r.payload
  r = await call(`/api/orders/${rechazado.id}/credit-authorization`, { method: 'POST', token: gerenteToken, body: { action: 'reject', note: 'No corresponde' } })
  assert.equal(r.status, 200, JSON.stringify(r.payload))
  r = await venta(rechazador.id, 100000, { creditDays: 15 })
  assert.equal(r.status, 201, JSON.stringify(r.payload))
  assert.equal(r.payload.creditAuthorization, null, 'el rechazado ya no cuenta como deuda: quedan 100.000 disponibles')
  r = await call(`/api/orders/${rechazado.id}`)
  assert.equal(r.payload.creditAuthorization?.status, 'REJECTED')

  // ── 6d) Devolución parcial con saldo a favor baja la deuda abierta ───────────
  const devolvedor = await nuevoCliente('Devolución Parcial', { creditLimitPyg: 1000000, creditDays: 30 })
  r = await venta(devolvedor.id, 1000000, { creditDays: 30, payments: [{ method: 'CASH', amountPyg: 400000 }] })
  assert.equal(r.status, 201, JSON.stringify(r.payload))
  assert.equal(r.payload.creditAuthorization, null)
  const conDevolucion = r.payload
  r = await call(`/api/orders/${conDevolucion.id}/return`, { method: 'POST', body: { operation: 'RETURN', reason: 'Devuelve un equipo', refundPyg: 300000, refundMode: 'CREDIT', restock: 'NONE' } })
  assert.equal(r.status, 200, JSON.stringify(r.payload))
  assert.equal(r.payload.status, 'PENDING', 'devolución parcial: el pedido sigue abierto')
  // Pagó 400.000 y devolvió 300.000 como saldo a favor: debe 300.000 (no 600.000),
  // así que quedan 700.000 disponibles y una venta de 700.000 no pide autorización.
  r = await venta(devolvedor.id, 700000, { creditDays: 30 })
  assert.equal(r.status, 201, JSON.stringify(r.payload))
  assert.equal(r.payload.creditAuthorization, null, 'la devolución parcial baja la deuda abierta')
  r = await venta(devolvedor.id, 10000, { creditDays: 30 })
  assert.equal(r.status, 201, JSON.stringify(r.payload))
  assert.equal(r.payload.creditAuthorization?.status, 'PENDING', 'con 300.000 + 700.000 el límite queda justo agotado')

  // ── 6e) El pedido con autorización de crédito no cambia de cliente ────────────
  const otro = await nuevoCliente('Otro Cliente')
  r = await call(`/api/orders/${retenido.id}`, { method: 'PATCH', token: adminToken, body: { action: 'setCustomer', customerId: otro.id } })
  assert.equal(r.status, 409, JSON.stringify(r.payload))
  assert.match(String(r.payload?.message), /autorización de crédito/)
  r = await call(`/api/orders/${retenido.id}`, { method: 'PATCH', token: adminToken, body: { action: 'createCustomer', customer: { name: `Nuevo ${stamp}`, phone: '595981000111' } } })
  assert.equal(r.status, 409, JSON.stringify(r.payload))
  assert.equal(psql(`SELECT "customerId" FROM "Order" WHERE "id" = '${retenido.id}'`), lucia.id)

  // ── 6f) «Autorizo yo»: el administrador sí; el gerente no se aprueba a sí mismo ─
  const propio = await nuevoCliente('Auto Aprobación', { creditLimitPyg: 100000, creditDays: 7 })
  r = await venta(propio.id, 600000, { creditDays: 7, creditSelfApproval: true }, gerenteToken)
  assert.equal(r.status, 403, 'un gerente no usa «Autorizo yo» sobre su propia venta')
  r = await venta(propio.id, 600000, { creditDays: 7, creditApprovalPin: PIN_GERENTE }, gerenteToken)
  assert.equal(r.status, 403, 'tampoco con su propio PIN')
  r = await venta(propio.id, 600000, { creditDays: 7 }, gerenteToken)
  assert.equal(r.status, 201, JSON.stringify(r.payload))
  assert.equal(r.payload.creditAuthorization?.status, 'PENDING')
  const delGerente = r.payload
  r = await call(`/api/orders/${delGerente.id}/credit-authorization`, { method: 'POST', token: gerenteToken, body: { action: 'approve' } })
  assert.equal(r.status, 403, 'el gerente no aprueba su propia solicitud desde el pedido')
  r = await call('/api/authorizations', { method: 'PATCH', token: gerenteToken, body: { id: delGerente.creditAuthorization.id, action: 'approve' } })
  assert.equal(r.status, 403, 'ni desde Autorizaciones')
  r = await call(`/api/orders/${delGerente.id}/credit-authorization`, { method: 'POST', token: adminToken, body: { action: 'approve' } })
  assert.equal(r.status, 200, JSON.stringify(r.payload))
  assert.equal(psql(`SELECT metadata->>'selfApproved' FROM "AuditLog" WHERE action = 'ORDER_CREDIT_AUTHORIZED' AND "entityId" = '${delGerente.id}'`), 'false')

  // ── 7) Los PIN incorrectos se limitan por solicitante (5 en 15 minutos) ───────
  for (let i = 0; i < 5; i += 1) {
    r = await call(`/api/orders/${deudaInicial.id}/credit-authorization`, { method: 'POST', token: cajeraToken, body: { action: 'approve', pin: '1111' } })
    assert.equal(r.status, 403)
  }
  r = await call(`/api/orders/${deudaInicial.id}/credit-authorization`, { method: 'POST', token: cajeraToken, body: { action: 'approve', pin: PIN_GERENTE } })
  assert.equal(r.status, 429, 'tras 5 PIN incorrectos ni el PIN correcto pasa desde ese usuario')

  // ── 8) Fuerza bruta en paralelo: 50 PIN erróneos simultáneos → a lo sumo 5 se comparan ─
  const antes = Number(psql(`SELECT COUNT(*) FROM "AuditLog" WHERE "tenantId" = 'tenant-a-it' AND "userId" = 'user-gerente-it' AND action = 'CREDIT_PIN_ATTEMPT'`))
  const rafaga = await Promise.all(Array.from({ length: 50 }, (_, i) => call(`/api/orders/${deudaInicial.id}/credit-authorization`, { method: 'POST', token: gerenteToken, body: { action: 'approve', pin: '1111' }, headers: { 'x-forwarded-for': `198.51.100.${i + 1}` } })))
  const comparados = rafaga.filter((x) => x.status === 403).length
  const limitados = rafaga.filter((x) => x.status === 429).length
  assert.ok(comparados <= 5, `a lo sumo 5 PIN se comparan (fueron ${comparados})`)
  assert.equal(comparados + limitados, 50, `el resto es 429: ${rafaga.map((x) => x.status).join(',')}`)
  const intentos = Number(psql(`SELECT COUNT(*) FROM "AuditLog" WHERE "tenantId" = 'tenant-a-it' AND "userId" = 'user-gerente-it' AND action = 'CREDIT_PIN_ATTEMPT'`)) - antes
  assert.ok(intentos <= 5, `solo quedan registrados 5 intentos (fueron ${intentos})`)

  // Con selfApproveRoles = [] ni el administrador aprueba su propia venta desde el pedido.
  setSelfApprove([])
  const propiaAdmin = await nuevoCliente('Admin propio', { creditLimitPyg: 100000, creditDays: 7 })
  r = await venta(propiaAdmin.id, 600000, { creditDays: 7 }, adminToken)
  assert.equal(r.status, 201, JSON.stringify(r.payload))
  assert.equal(r.payload.creditAuthorization?.status, 'PENDING')
  r = await call(`/api/orders/${r.payload.id}/credit-authorization`, { method: 'POST', token: adminToken, body: { action: 'approve' } })
  assert.equal(r.status, 403, 'el administrador no aprueba su propia venta a crédito sin configuración')

  // ── 9) Límite y tolerancia del módulo, plazo y cuotas ───────────────────────
  mergeSettings({ moduleConfig: { cuotas: { defaultLimitPyg: 5000000, tolerancePct: 10, plazo: { mode: 'DIAS', days: 15, dayOfMonth: 5, installments: 3, intervalDays: 30, maxDays: 60 } } } })
  // Cliente sin límite propio: rige el del módulo (5.000.000) con su tolerancia (10 %).
  const delModulo = await nuevoCliente('Límite del módulo')
  r = await venta(delModulo.id, 5500000, { credit: true })
  assert.equal(r.status, 201, JSON.stringify(r.payload))
  assert.equal(r.payload.creditAuthorization, null, '5.500.000 entra por la tolerancia del módulo')
  assert.equal(r.payload.creditDays, 15, 'el plazo por defecto del módulo')
  assert.equal(Number(psql(`SELECT COUNT(*) FROM "AuditLog" WHERE action = 'CREDIT_TOLERANCE_USED' AND "entityId" = '${r.payload.id}'`)), 1, 'el uso de la tolerancia queda auditado')
  const pasadoModulo = await nuevoCliente('Pasa el tope')
  r = await venta(pasadoModulo.id, 5500001, { credit: true })
  assert.equal(r.status, 201, JSON.stringify(r.payload))
  assert.equal(r.payload.creditAuthorization?.status, 'PENDING', 'un peso sobre el tope pide autorización')
  assert.equal(r.payload.creditAuthorization?.overPyg, 1)
  // Ficha con límite propio: la tolerancia es la suya si la tiene, si no la del módulo.
  const propioSinTol = await nuevoCliente('Límite propio', { creditLimitPyg: 1000000 })
  r = await venta(propioSinTol.id, 1100000, { credit: true })
  assert.equal(r.payload.creditAuthorization, null, 'sin tolerancia propia vale la del módulo')
  const propioConCero = await nuevoCliente('Sin tolerancia', { creditLimitPyg: 1000000, creditTolerancePct: 0 })
  r = await venta(propioConCero.id, 1000001, { credit: true })
  assert.equal(r.payload.creditAuthorization?.status, 'PENDING', 'tolerancia 0 de la ficha: manda el límite a secas')
  // Plazo: más allá del máximo del módulo pide autorización de días (administración y gerencia pueden solas).
  const largo = await nuevoCliente('Plazo largo', { creditLimitPyg: 100000000 })
  r = await venta(largo.id, 100000, { creditDays: 61 })
  assert.equal(r.status, 403, 'el vendedor no pasa el máximo de días')
  r = await venta(largo.id, 100000, { creditDays: 61 }, gerenteToken)
  assert.equal(r.status, 201, JSON.stringify(r.payload))
  assert.equal(r.payload.creditDays, 61)
  // Día del mes.
  mergeSettings({ moduleConfig: { cuotas: { defaultLimitPyg: 5000000, tolerancePct: 10, plazo: { mode: 'DIA_MES', dayOfMonth: 5, maxDays: 365 } } } })
  r = await venta(largo.id, 100000, { credit: true })
  assert.equal(r.status, 201, JSON.stringify(r.payload))
  assert.equal(psql(`SELECT to_char("dueAt" - interval '3 hours', 'DD') FROM "Order" WHERE "id" = '${r.payload.id}'`), '05', 'vence el día 5 del mes')
  // Cuotas desde la ficha: pagos CREDIT con vencimiento que suman el saldo.
  const encuotas = await nuevoCliente('En cuotas', { creditLimitPyg: 100000000, creditTermMode: 'CUOTAS', creditInstallments: 3 })
  r = await venta(encuotas.id, 1000001, { credit: true })
  assert.equal(r.status, 201, JSON.stringify(r.payload))
  const cuotas = await call(`/api/orders/${r.payload.id}`)
  const plan = cuotas.payload.payments.filter((p) => p.method === 'CREDIT').sort((a, b) => a.dueAt.localeCompare(b.dueAt))
  assert.deepEqual(plan.map((p) => Number(p.amountPyg)), [333333, 333333, 333335])
  assert.ok(plan.every((p) => p.status === 'PENDING' && p.pendingReason === 'CUOTA' && p.dueAt))
  assert.equal(psql(`SELECT COALESCE(SUM("amountPyg"), 0) FROM "Payment" WHERE "orderId" = '${r.payload.id}' AND status = 'CONFIRMED'`), '0', 'las cuotas pendientes no suman como cobradas')
  // La ficha valida sus campos de plazo y tolerancia.
  r = await call(`/api/customers/${encuotas.id}`, { method: 'PATCH', body: { creditTolerancePct: 15 } })
  assert.equal(r.status, 400, JSON.stringify(r.payload))
  r = await call(`/api/customers/${encuotas.id}`, { method: 'PATCH', body: { creditTolerancePct: 20, creditTermMode: 'DIAS' } })
  assert.equal(r.status, 200, JSON.stringify(r.payload))
  assert.equal(psql(`SELECT "creditTolerancePct" FROM "Customer" WHERE "id" = '${encuotas.id}'`), '20')

  console.log('credito-autorizacion: OK')
} finally {
  psql(`UPDATE "User" SET "pinHash" = '${hashOriginal}' WHERE "id" = 'user-gerente-it'`)
  psql(`UPDATE "Tenant" SET "settings" = '${settingsOriginal.replace(/'/g, "''")}'::jsonb WHERE "id" = 'tenant-a-it'`)
}
