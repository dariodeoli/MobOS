// Portal público del cliente por QR: enlaces por nivel (rápido | completo),
// saldo y vencimientos, pedidos, garantías, direcciones, regeneración que
// invalida el enlace anterior, token inválido y ausencia de datos internos.
// Uso: node backend/tests/customer-portal.mjs BASE_URL ADMIN_TOKEN SELLER_TOKEN [CAJERA_TOKEN] [DATABASE_URL] [PG_BIN]

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const [baseUrl, adminToken, sellerToken, cajeraToken, databaseUrl, pgBin] = process.argv.slice(2)
if (!baseUrl || !adminToken || !sellerToken) throw new Error('Uso: customer-portal.mjs <baseUrl> <adminToken> <sellerToken> [cajeraToken] [databaseUrl] [pgBin]')

const tenantHeaders = { 'x-tenant-id': 'tenant-a-it' }

async function request(path, method = 'GET', body, token = adminToken) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...tenantHeaders, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  const payload = await response.json().catch(() => null)
  return { response, payload }
}

async function publicRequest(path) {
  const response = await fetch(`${baseUrl}${path}`)
  const payload = await response.json().catch(() => null)
  return { response, payload }
}

const ts = Date.now()
const FORBIDDEN = ['costPyg', 'unitCostPyg', 'baseUnitCostPyg', 'notes', 'phone', 'email', 'document', 'debtPyg', 'sellerId', 'receiptSnapshot']

// ── Ficha con crédito, dirección y una garantía activa ─────────────────────
let result = await request('/api/customers', 'POST', {
  name: `Cliente Portal ${ts}`,
  creditLimitPyg: 500000,
  creditDays: 15,
  addresses: [{ label: 'Casa', address: `Av. Portal ${ts}`, city: 'Asunción', country: 'Paraguay', isDefault: true }],
})
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const cliente = result.payload
assert.ok(cliente.id)

// Nota pública de la tienda (issue #127): viaja al portal. La nota interna
// del equipo sigue prohibida en ambos niveles.
const notaPublica = `Pasá por el local a retirar tu pedido ${ts}.`
const notaInterna = `IT-INTERNA-NO-DEBE-VIAJAR-${ts}`
result = await request(`/api/customers/${encodeURIComponent(cliente.id)}`, 'PATCH', { publicNote: notaPublica })
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
result = await request(`/api/customers/${encodeURIComponent(cliente.id)}/notes`, 'POST', { content: notaInterna }, sellerToken)
assert.equal(result.response.status, 201, JSON.stringify(result.payload))

// Otro cliente con su propio pedido: no debe filtrarse al portal del primero.
result = await request('/api/customers', 'POST', { name: `Cliente Portal Ajeno ${ts}` })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const clienteAjeno = result.payload

result = await request('/api/products', 'POST', { sku: `IT-PORTAL-SKU-${ts}`, name: 'Producto portal', pricePyg: 100000, stock: 5, branchId: 'branch-a-it' })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const producto = result.payload

result = await request('/api/products', 'POST', { sku: `IT-PORTAL-SKU-B-${ts}`, name: 'Producto portal ajeno', pricePyg: 100000, stock: 5, branchId: 'branch-a-it' })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const productoAjeno = result.payload

// Pedido del cliente con pago parcial a crédito: saldo 60.000 y vencimiento.
const numeroPedido = `IT-PORTAL-${ts}`
result = await request('/api/orders', 'POST', {
  orderNumber: numeroPedido,
  customerId: cliente.id,
  creditDays: 15,
  items: [{ productId: producto.id, description: 'Producto portal', quantity: 1, unitPricePyg: 100000 }],
  payment: { method: 'CASH', amountPyg: 40000 },
}, sellerToken)
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const pedido = result.payload
assert.ok(pedido.publicToken, 'El pedido del portal necesita token público.')

const numeroPedidoAjeno = `IT-PORTAL-AJENO-${ts}`
result = await request('/api/orders', 'POST', {
  orderNumber: numeroPedidoAjeno,
  customerId: clienteAjeno.id,
  items: [{ productId: productoAjeno.id, description: 'Producto ajeno', quantity: 1, unitPricePyg: 100000 }],
  payment: { method: 'CASH', amountPyg: 100000 },
}, sellerToken)
assert.equal(result.response.status, 201, JSON.stringify(result.payload))

const serialGarantia = `IT-PORTAL-SER-${ts}`
result = await request('/api/warranties', 'POST', { customerId: cliente.id, customerName: cliente.name, serial: serialGarantia, description: 'Equipo con garantía portal', branchId: 'branch-a-it' }, adminToken)
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const garantiaPortal = Array.isArray(result.payload) ? result.payload[0] : result.payload
assert.ok(garantiaPortal.publicToken, 'La garantía debe devolver su token público al crearse.')

// ── Enlace rápido: saldo, vencimientos y pedidos, sin datos internos ───────
result = await request(`/api/customers/${encodeURIComponent(cliente.id)}/access-token`, 'POST', { level: 'rapido' }, sellerToken)
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
const tokenRapido = result.payload.token
assert.ok(tokenRapido, 'El nivel rápido debe devolver token.')
assert.equal(result.payload.level, 'rapido')

result = await request(`/api/customers/${encodeURIComponent(cliente.id)}/access-token`, 'POST', { level: 'rapido' }, sellerToken)
assert.equal(result.response.status, 200)
// Seguridad #172/#178: el token vigente no se vuelve a mostrar (solo se guarda
// su hash), pero tampoco se rota en silencio: el enlace anterior sigue vivo.
assert.equal(result.payload.reused, true, 'Sin regenerate debe reutilizarse el enlace vigente.')
assert.equal(result.payload.token ?? null, null, 'El token vigente no se vuelve a mostrar.')
assert.equal(result.payload.level, 'rapido')
const vigenteSigueVivo = await publicRequest(`/api/portal/${encodeURIComponent(tokenRapido)}`)
assert.equal(vigenteSigueVivo.response.status, 200, 'El enlace vigente debe seguir funcionando.')

result = await publicRequest(`/api/portal/${encodeURIComponent(tokenRapido)}`)
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
const rapido = result.payload
assert.equal(rapido.level, 'rapido')
assert.equal(rapido.company.name, 'Tenant A Integration')
assert.equal(rapido.customer.name, cliente.name)
assert.equal(rapido.customer.publicNote, notaPublica, 'El nivel rápido debe llevar la nota pública de la tienda.')
assert.equal(rapido.balancePyg, 60000, 'El saldo pendiente debe sumar solo lo no cobrado.')
// Beneficios (#240 → portal): el contrato incluye saldo a favor y puntos.
assert.equal(typeof rapido.saldoFavorPyg, 'number', 'El portal debe traer el saldo a favor.')
assert.equal(rapido.saldoFavorPyg, 0, 'Sin crédito de tienda el saldo a favor es 0.')
assert.equal(typeof rapido.puntosPyg, 'number', 'El portal debe traer los puntos.')
assert.equal(rapido.dueDates.length, 1, 'El pedido a crédito debe listar su vencimiento.')
assert.equal(rapido.dueDates[0].orderNumber, numeroPedido)
assert.equal(rapido.dueDates[0].pendingPyg, 60000)
assert.ok(rapido.dueDates[0].dueAt, 'El vencimiento debe traer fecha.')
const pedidoPortal = rapido.orders.find(order => order.orderNumber === numeroPedido)
assert.ok(pedidoPortal, 'El portal debe listar el pedido del cliente.')
assert.equal(pedidoPortal.totalPyg, 100000)
assert.equal(pedidoPortal.pendingPyg, 60000)
assert.equal(pedidoPortal.status, 'PENDING')
assert.equal(pedidoPortal.fulfillmentStatus, 'PROCESSING')
// Seguimiento de la entrega (#240 → portal): los pasos del método con su
// fecha, en el nivel rápido (es estado de entrega, no comprobante).
assert.ok(pedidoPortal.tracking?.pasos?.length >= 3, 'El portal debe traer los pasos de la entrega.')
assert.equal(pedidoPortal.tracking.pasos.filter(paso => paso.actual).length, 1, 'Un solo paso actual.')
assert.equal(pedidoPortal.tracking.estadoLabel, 'En preparación', 'El paso actual trae su etiqueta de cliente.')
assert.ok(pedidoPortal.tracking.pasos[0].hecho, 'El primer paso está cumplido.')
assert.equal(rapido.orders.some(order => order.orderNumber === numeroPedidoAjeno), false, 'No deben aparecer pedidos de otro cliente.')
assert.equal('warranties' in rapido, false, 'El nivel rápido no expone garantías.')
assert.equal('addresses' in rapido, false, 'El nivel rápido no expone direcciones.')
assert.equal(pedidoPortal.receiptToken, undefined, 'El nivel rápido no expone enlaces de comprobantes.')
const serializado = JSON.stringify(rapido)
for (const campo of FORBIDDEN) {
  assert.equal(serializado.includes(campo), false, `El portal no debe exponer ${campo}.`)
}
assert.equal(serializado.includes(notaInterna), false, 'La nota interna nunca viaja al portal rápido.')
assert.equal(serializado.includes(notaPublica), true, 'La nota pública debe viajar al portal rápido.')

// ── Enlace completo: garantías, direcciones y comprobantes ─────────────────
result = await request(`/api/customers/${encodeURIComponent(cliente.id)}/access-token`, 'POST', { level: 'completo' }, sellerToken)
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
const tokenCompleto = result.payload.token
assert.notEqual(tokenCompleto, tokenRapido, 'Cada nivel tiene su propio token.')

result = await publicRequest(`/api/portal/${encodeURIComponent(tokenCompleto)}`)
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
const completo = result.payload
assert.equal(completo.level, 'completo')
assert.equal(completo.balancePyg, 60000)
assert.equal(completo.customer.publicNote, notaPublica, 'El nivel completo debe llevar la nota pública de la tienda.')
const garantia = (completo.warranties || []).find(item => item.serial === serialGarantia)
assert.ok(garantia, 'El nivel completo debe listar las garantías activas.')
assert.equal(garantia.description, 'Equipo con garantía portal')
assert.equal(garantia.status, 'RECEIVED')
// #240 → portal: la garantía enlaza su credencial pública (el mismo token del QR).
assert.equal(garantia.publicToken, garantiaPortal.publicToken, 'La garantía del portal debe enlazar su credencial.')
assert.equal(garantia.taller, undefined, 'Sin orden de taller no hay etapa de servicio.')
const credencial = await publicRequest(`/api/public/warranty/${encodeURIComponent(garantiaPortal.publicToken)}`)
assert.equal(credencial.response.status, 200, 'La credencial de la garantía debe abrir sin sesión.')
assert.equal(credencial.payload.serial, serialGarantia)
assert.match(credencial.payload.productName || '', /garantía portal/i)

// ── La garantía en el taller: la orden que nace del caso se ve en el portal ──
result = await request('/api/service-orders', 'POST', {
  warrantyCaseId: garantiaPortal.id,
  customerId: cliente.id,
  customerName: cliente.name,
  device: 'Equipo con garantía portal',
  serial: serialGarantia,
}, adminToken)
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
result = await publicRequest(`/api/portal/${encodeURIComponent(tokenCompleto)}`)
assert.equal(result.response.status, 200)
const garantiaConTaller = (result.payload.warranties || []).find(item => item.serial === serialGarantia)
assert.equal(garantiaConTaller.taller?.statusLabel, 'Recibido', 'La garantía debe mostrar la etapa del taller.')
assert.equal((completo.addresses || []).some(address => address.address === `Av. Portal ${ts}`), true, 'El nivel completo debe listar las direcciones.')
const pedidoCompleto = completo.orders.find(order => order.orderNumber === numeroPedido)
assert.equal(pedidoCompleto.receiptToken, pedido.publicToken, 'El pedido debe enlazar a su comprobante público.')
assert.ok(pedidoCompleto.tracking?.pasos?.length >= 3, 'El nivel completo también sigue la entrega.')
const serializadoCompleto = JSON.stringify(completo)
for (const campo of FORBIDDEN) {
  assert.equal(serializadoCompleto.includes(campo), false, `El portal completo no debe exponer ${campo}.`)
}
assert.equal(serializadoCompleto.includes(notaInterna), false, 'La nota interna nunca viaja al portal completo.')
assert.equal(serializadoCompleto.includes(notaPublica), true, 'La nota pública debe viajar al portal completo.')

// ── Mensajes de la tienda (#240 → portal): se ven al abrir la cuenta ────────
result = await request(`/api/customers/${encodeURIComponent(cliente.id)}/notices`, 'POST', { content: `Mensaje IT ${ts}` }, sellerToken)
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const mensajeId = result.payload.id
// Avisos internos (#240 → seguimiento): la lista marca lo que no se abrió.
result = await request(`/api/customers?q=${encodeURIComponent(`Cliente Portal ${ts}`)}`)
const filaLista = (result.payload || []).find((row) => row.id === cliente.id)
assert.equal(filaLista?.stats?.sinVer?.mensajes, 1, 'La lista debe marcar el mensaje sin ver.')
assert.equal(filaLista?.stats?.sinVer?.informes, 0, 'Sin informes compartidos no hay informes sin ver.')
result = await publicRequest(`/api/portal/${encodeURIComponent(tokenCompleto)}`)
assert.equal(result.response.status, 200)
const mensajePortal = (result.payload.mensajes || []).find((item) => item.content === `Mensaje IT ${ts}`)
assert.ok(mensajePortal, 'El portal debe listar el mensaje de la tienda.')
assert.equal(mensajePortal.nuevo, true, 'La primera apertura lo marca como nuevo.')
result = await publicRequest(`/api/portal/${encodeURIComponent(tokenCompleto)}`)
assert.equal(result.payload.mensajes.find((item) => item.content === `Mensaje IT ${ts}`).nuevo, false, 'La segunda apertura ya no es nueva.')
result = await request(`/api/customers/${encodeURIComponent(cliente.id)}`)
const avisoFicha = (result.payload.customerNotices || []).find((item) => item.id === mensajeId)
assert.ok(avisoFicha?.firstViewedAt, 'La ficha ve el visto del mensaje.')
assert.equal((result.payload.customerNotices || []).some((item) => item.content === `Mensaje IT ${ts}`), true)
const cronoMensaje = await request(`/api/customers/${encodeURIComponent(cliente.id)}/timeline?limit=50`)
assert.ok(cronoMensaje.payload.events.some((event) => event.action === 'Mensaje al cliente'), 'La cronología registra el envío.')
assert.ok(cronoMensaje.payload.events.some((event) => event.action === 'Mensaje visto por el cliente'), 'La cronología registra el visto.')

// ── Reservas (#240 → portal): el equipo reservado se ve con su vencimiento ──
result = await request('/api/inventory-units', 'POST', { productId: producto.id, serial: `IT-PORTAL-RES-${ts}`, condition: 'USED', branchId: 'branch-a-it' }, adminToken)
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
// El serial se normaliza al crear la unidad: se usa el devuelto para reservar.
const serialReserva = result.payload.serial
result = await request('/api/inventory-reservations', 'POST', { customerId: cliente.id, minutes: 120, serials: [serialReserva] }, sellerToken)
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
result = await publicRequest(`/api/portal/${encodeURIComponent(tokenCompleto)}`)
assert.equal(result.response.status, 200)
const reservaPortal = (result.payload.reservas || []).find((item) => item.serial === serialReserva)
assert.ok(reservaPortal, 'El portal debe listar la reserva del cliente.')
assert.ok(reservaPortal.reservedUntil, 'La reserva trae su vencimiento.')
assert.equal(reservaPortal.model, producto.name, 'La reserva trae el equipo.')

// ── Pagos (#240 → portal): historial y total confirmado ─────────────────────
const pagoPortal = (result.payload.pagos || []).find((pago) => pago.orderNumber === numeroPedido)
assert.ok(pagoPortal, 'El portal debe listar el pago del pedido.')
assert.equal(pagoPortal.amountPyg, 40000, 'El pago confirmado viaja con su monto.')
assert.ok(pagoPortal.methodLabel, 'El pago viaja con su medio legible.')
assert.ok(pagoPortal.paidAt, 'El pago viaja con su fecha.')
assert.ok(result.payload.totalPagadoPyg >= 40000, 'El total pagado suma los pagos confirmados.')

// ── Regeneración: el enlace anterior deja de funcionar ─────────────────────
result = await request(`/api/customers/${encodeURIComponent(cliente.id)}/access-token`, 'POST', { level: 'rapido', regenerate: true }, sellerToken)
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.notEqual(result.payload.token, tokenRapido, 'Regenerar debe entregar un token nuevo.')
const tokenRapidoNuevo = result.payload.token
result = await publicRequest(`/api/portal/${encodeURIComponent(tokenRapido)}`)
assert.equal(result.response.status, 404, 'El token viejo debe dejar de funcionar al regenerar.')
result = await publicRequest(`/api/portal/${encodeURIComponent(tokenRapido)}/logo`)
assert.equal(result.response.status, 404, 'El logo del token revocado tampoco se entrega.')
result = await publicRequest(`/api/portal/${encodeURIComponent(tokenRapidoNuevo)}`)
assert.equal(result.response.status, 200)
assert.equal(result.payload.balancePyg, 60000)

// ── Límites: token inválido, nivel inválido y rol sin permiso ──────────────
result = await publicRequest('/api/portal/token-inventado-que-no-existe')
assert.equal(result.response.status, 404)
result = await publicRequest('/api/portal/token-inventado-que-no-existe/logo')
assert.equal(result.response.status, 404)
result = await request(`/api/customers/${encodeURIComponent(cliente.id)}/access-token`, 'POST', { level: 'detallado' }, sellerToken)
assert.equal(result.response.status, 400, 'Solo rápido y completo son niveles válidos.')
result = await request('/api/customers/cliente-inexistente-portal/access-token', 'POST', { level: 'rapido' }, sellerToken)
assert.equal(result.response.status, 404, 'Un cliente inexistente no genera enlace.')
if (cajeraToken) {
  result = await request(`/api/customers/${encodeURIComponent(cliente.id)}/access-token`, 'POST', { level: 'rapido' }, cajeraToken)
  assert.equal(result.response.status, 403, 'Caja no genera enlaces del portal.')
}

// ── Auditoría: creación y regeneración con usuario ─────────────────────────
if (databaseUrl && pgBin) {
  const psql = (sql) => execFileSync(path.join(pgBin, 'psql'), [databaseUrl, '-At', '-c', sql], { encoding: 'utf8' }).trim()
  assert.equal(psql(`SELECT COUNT(*) FROM "AuditLog" WHERE "action" = 'CUSTOMER_PORTAL_TOKEN_REGENERATED' AND "entityId" = '${cliente.id}' AND "userId" IS NOT NULL`), '1')
  assert.ok(Number(psql(`SELECT COUNT(*) FROM "AuditLog" WHERE "action" = 'CUSTOMER_PORTAL_TOKEN_CREATED' AND "entityId" = '${cliente.id}'`)) >= 2)
  // Los tokens públicos quedan hasheados en la base (#172/#178): los enlaces
  // nuevos del portal no guardan el valor en claro.
  assert.equal(psql(`SELECT COUNT(*) FROM "CustomerPortalToken" WHERE "customerId" = '${cliente.id}' AND "token" IS NOT NULL`), '0', 'El portal nuevo no debe guardar el token en claro.')
  assert.ok(Number(psql(`SELECT COUNT(*) FROM "CustomerPortalToken" WHERE "customerId" = '${cliente.id}' AND "tokenHash" IS NOT NULL`)) >= 2, 'Cada enlace del portal debe guardar su hash.')
  assert.equal(psql(`SELECT COUNT(*) FROM "WarrantyCase" WHERE "id" = '${garantiaPortal.id}' AND "publicTokenHash" IS NOT NULL`), '1', 'La garantía debe guardar el hash de su token público.')
}

// ── Rate limit de la página pública de garantía (#178) ─────────────────────
// Bucket propio por IP para no interferir con el resto del arnés.
let garantiaLimitada = false
for (let intento = 0; intento < 40 && !garantiaLimitada; intento += 1) {
  const respuesta = await fetch(`${baseUrl}/api/public/warranty/${encodeURIComponent(garantiaPortal.publicToken)}`, { headers: { 'x-forwarded-for': '203.0.113.99' } })
  if (respuesta.status === 429) garantiaLimitada = true
  else assert.equal(respuesta.status, 200, `La garantía pública debe responder 200 antes del límite (recibido ${respuesta.status}).`)
}
assert.equal(garantiaLimitada, true, 'La página pública de garantía debe limitar la tasa de pedidos (429).')

console.log('customer-portal: 40 checks OK (token rápido con saldo/vencimientos/pedidos, completo con garantías/direcciones/comprobantes, regeneración 404, token inválido, límites por rol y sin campos internos).')
