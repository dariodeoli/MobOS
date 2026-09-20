import assert from 'node:assert/strict'

// Ciclo completo de una liquidación de comisiones (#83): regla → ventas →
// calcular/cerrar → comprobante congelado → pagar → auditoría → verificación
// pública por token. También cubre los frenos: sin ventas, superposición y
// doble pago, y que liquidar/pagar sea de administración y gerencia.
//
// El vendedor es propio de esta prueba (con su venta) para que el total no
// dependa de las ventas que otros arneses crean con el mismo token.

const [baseUrl, adminToken, sellerToken, cajeraToken, gerenteToken, companyToken] = process.argv.slice(2)
if (!baseUrl || !adminToken || !sellerToken || !cajeraToken || !gerenteToken || !companyToken) {
  throw new Error('Uso: commission-settlements.mjs <baseUrl> <adminToken> <sellerToken> <cajeraToken> <gerenteToken> <companyToken>')
}

async function request(path, method = 'GET', body, token = adminToken, { tenant = 'tenant-a-it' } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(tenant ? { 'x-tenant-id': tenant } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const payload = await response.json().catch(() => null)
  return { status: response.status, payload }
}

function cookieValue(cookies, name) {
  const row = (cookies || []).find((value) => String(value).startsWith(`${name}=`))
  return row ? row.split(';')[0].split('=').slice(1).join('=') : ''
}

const hoy = () => {
  const fecha = new Date()
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`
}
const haceDias = (dias) => {
  const fecha = new Date(Date.now() - dias * 86400000)
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`
}

// ── Vendedor dedicado de la prueba (con sesión propia) ──────────────────────
const marca = Date.now().toString(36)
let vendedor = null
let pinUsado = ''
for (let intento = 0; intento < 5 && !vendedor; intento += 1) {
  pinUsado = String(1000 + Math.floor(Math.random() * 9000))
  const respuesta = await request('/api/users', 'POST', { name: `Vendedor Comisiones ${marca}`, pin: pinUsado, role: 'VENDEDOR', branchId: 'branch-a-it' })
  if (respuesta.status === 201) vendedor = respuesta.payload
}
assert.ok(vendedor?.id, 'No se pudo crear el vendedor de la liquidación.')

const login = await fetch(`${baseUrl}/api/auth/pin`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${companyToken}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ sellerId: vendedor.id, pin: pinUsado }),
})
assert.equal(login.status, 200, 'No se pudo iniciar la sesión del vendedor.')
const vendedorToken = cookieValue(typeof login.headers.getSetCookie === 'function' ? login.headers.getSetCookie() : [login.headers.get('set-cookie')].filter(Boolean), 'mobos_seller_session')
assert.ok(vendedorToken, 'El login del vendedor no emitió sesión.')

// ── Preparación: producto con costo conocido y regla de comisión ────────────
const sku = `COM-IT-${marca}`
let result = await request('/api/products', 'POST', { sku, name: 'Equipo liquidación comisiones', pricePyg: 100000, costPyg: 60000, stock: 10, branchId: 'branch-a-it' })
assert.equal(result.status, 201, JSON.stringify(result.payload))
const producto = result.payload
assert.equal(result.payload.costPyg, 60000)

result = await request('/api/commission-rules', 'POST', { userId: vendedor.id, percentPyg: 10 })
assert.equal(result.status, 201, JSON.stringify(result.payload))
assert.equal(result.payload.percentPyg, 10)

// ── Dos ventas del vendedor: margen 40.000 cada una ─────────────────────────
const vender = async (orderNumber) => {
  const venta = await request('/api/orders', 'POST', {
    orderNumber,
    items: [{ productId: producto.id, description: 'Equipo liquidación comisiones', quantity: 1, unitPricePyg: 100000 }],
    payment: { method: 'CASH', amountPyg: 100000 },
  }, vendedorToken)
  assert.equal(venta.status, 201, JSON.stringify(venta.payload))
  return venta.payload
}
const ventaUno = await vender(`IT-COM-${marca}-1`)
const ventaDos = await vender(`IT-COM-${marca}-2`)

// ── Permisos: un vendedor no liquida; la caja tampoco (es de gerencia) ────
const periodo = { sellerId: vendedor.id, from: haceDias(1), to: hoy() }
result = await request('/api/commission-settlements', 'POST', periodo, sellerToken)
assert.equal(result.status, 403, 'Un vendedor no puede liquidar comisiones.')
result = await request('/api/commission-settlements', 'POST', periodo, cajeraToken)
assert.equal(result.status, 403, 'La caja no liquida comisiones: es de administración y gerencia.')
result = await request('/api/commission-settlements', 'GET', undefined, cajeraToken)
assert.equal(result.status, 403, 'La caja tampoco ve las liquidaciones por defecto.')
result = await request('/api/commission-settlements', 'GET', undefined, gerenteToken)
assert.equal(result.status, 200, 'Gerencia lee las liquidaciones.')
result = await request('/api/commission-settlements', 'GET', undefined, vendedorToken)
assert.equal(result.status, 403, 'El vendedor no ve liquidaciones.')

// ── Cerrar el período congelando el detalle ─────────────────────────────────
result = await request('/api/commission-settlements', 'POST', periodo)
assert.equal(result.status, 201, JSON.stringify(result.payload))
const liquidacion = result.payload
// Dos ventas de margen 40.000 al 10%: 8.000.
assert.equal(liquidacion.totalPyg, 8000)
assert.equal(liquidacion.marginPyg, 80000)
assert.equal(liquidacion.commissionPct, 10)
assert.equal(liquidacion.status, 'DRAFT')
assert.equal(liquidacion.sellerId, vendedor.id)
assert.ok(liquidacion.verificationToken && liquidacion.verificationToken.length >= 16, 'La liquidación debe traer token de verificación.')
assert.equal(liquidacion.createdBy?.id, 'user-admin-it')

result = await request(`/api/commission-settlements/${liquidacion.id}`, 'GET')
assert.equal(result.status, 200, JSON.stringify(result.payload))
assert.equal(result.payload.lines.length, 2, 'El detalle debe congelar una línea por venta.')
const numeros = new Set([ventaUno.orderNumber, ventaDos.orderNumber])
for (const line of result.payload.lines) {
  assert.ok(numeros.has(line.orderNumber), `línea inesperada: ${line.orderNumber}`)
  assert.equal(line.basePyg, 40000)
  assert.equal(line.commissionPyg, 4000)
}
assert.equal(result.payload.lines.reduce((total, line) => total + line.commissionPyg, 0), 8000)

// ── Frenos: superposición y vendedor sin ventas ─────────────────────────────
result = await request('/api/commission-settlements', 'POST', periodo)
assert.equal(result.status, 409, 'No se puede liquidar dos veces el mismo tramo.')
assert.match(String(result.payload?.message || ''), /superpone/i)
result = await request('/api/commission-settlements', 'POST', { sellerId: 'user-gerente-it', from: '2020-01-01', to: '2020-01-31' })
assert.equal(result.status, 409, 'Un período sin ventas no genera liquidación.')
assert.match(String(result.payload?.message || ''), /no tiene ventas/i)

// ── Auditoría del cierre ────────────────────────────────────────────────────
result = await request('/api/audit?action=COMMISSION_SETTLED&limit=5')
assert.equal(result.status, 200, JSON.stringify(result.payload))
const cierre = (result.payload || []).find(row => row.entityId === liquidacion.id)
assert.ok(cierre, 'El cierre debe quedar auditado como COMMISSION_SETTLED.')
assert.equal(cierre.userId, 'user-admin-it')
assert.equal(cierre.metadata.sellerId, vendedor.id)
assert.equal(cierre.metadata.totalPyg, 8000)
assert.equal(cierre.metadata.orders, 2)

// ── Pagar: gerencia puede, la caja no ───────────────────────────────────────
result = await request(`/api/commission-settlements/${liquidacion.id}`, 'PATCH', { action: 'pay' }, cajeraToken)
assert.equal(result.status, 403, 'La caja no paga comisiones.')
result = await request(`/api/commission-settlements/${liquidacion.id}`, 'PATCH', { action: 'pay' }, gerenteToken)
assert.equal(result.status, 200, JSON.stringify(result.payload))
assert.equal(result.payload.status, 'PAID')
assert.ok(result.payload.paidAt, 'Debe quedar registrada la fecha de pago.')
assert.equal(result.payload.paidBy?.id, 'user-gerente-it', 'Debe quedar registrado quién pagó.')

result = await request(`/api/commission-settlements/${liquidacion.id}`, 'PATCH', { action: 'pay' })
assert.equal(result.status, 409, 'Una liquidación ya pagada no se paga de nuevo.')
result = await request(`/api/commission-settlements/${liquidacion.id}`, 'PATCH', { action: 'cancel' })
assert.equal(result.status, 409, 'Una liquidación pagada no se anula.')

result = await request('/api/audit?action=COMMISSION_SETTLEMENT_PAID&limit=5')
assert.equal(result.status, 200, JSON.stringify(result.payload))
const pago = (result.payload || []).find(row => row.entityId === liquidacion.id)
assert.ok(pago, 'El pago debe quedar auditado como COMMISSION_SETTLEMENT_PAID.')
assert.equal(pago.userId, 'user-gerente-it')
assert.equal(pago.metadata.totalPyg, 8000)

// ── Verificación pública por token (lo que escanea el QR), sin sesión ───────
result = await request(`/api/public/commission-settlements/${encodeURIComponent(liquidacion.verificationToken)}`, 'GET', undefined, '', { tenant: '' })
assert.equal(result.status, 200, JSON.stringify(result.payload))
assert.equal(result.payload.sellerName, vendedor.name)
assert.equal(result.payload.totalPyg, 8000)
assert.equal(result.payload.status, 'PAID')
assert.equal(result.payload.periodFrom, periodo.from)
assert.equal(result.payload.periodTo, periodo.to)
assert.equal(result.payload.verificado, true)
assert.ok(result.payload.emitidaEn, 'Debe informar la fecha de emisión.')
for (const sensible of ['lines', 'createdBy', 'paidBy', 'verificationToken', 'tenantId', 'marginPyg', 'commissionPct']) {
  assert.equal(sensible in result.payload, false, `La verificación pública no debe exponer ${sensible}.`)
}
result = await request('/api/public/commission-settlements/token-que-no-existe', 'GET', undefined, '', { tenant: '' })
assert.equal(result.status, 404, 'Un token inválido no verifica nada.')

// ── Aislamiento: el header de otra empresa no cambia el tenant de la sesión ─
result = await request(`/api/commission-settlements/${liquidacion.id}`, 'GET', undefined, adminToken, { tenant: 'tenant-b-it' })
assert.equal(result.status, 200)
assert.equal(result.payload.id, liquidacion.id, 'El header de otra empresa no altera el alcance de la sesión.')

// Limpieza: el vendedor dedicado queda inactivo (la liquidación persiste).
result = await request('/api/users', 'PATCH', { id: vendedor.id, status: 'INACTIVE' })
assert.equal(result.status, 200, JSON.stringify(result.payload))

console.log('commission-settlements: OK (cerrar → detalle congelado → pagar con actor → auditoría → verificación pública por token, con permisos de gerencia).')
