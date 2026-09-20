// Turnos de caja por usuario y arqueo por denominación (issue #103): ciclo
// real contra PostgreSQL descartable — abrir turno, vender en efectivo,
// registrar un movimiento, cerrar con arqueo, auditar el cierre y verificar el
// comprobante público del QR. Sin .env y sin acceso a ninguna base configurada.
// Uso: node backend/tests/cash-shifts.mjs BASE_URL CAJERA_TOKEN ADMIN_TOKEN SELLER_TOKEN

import assert from 'node:assert/strict'

const [baseUrl, cajeraToken, adminToken, sellerToken] = process.argv.slice(2)
if (!baseUrl || !cajeraToken || !adminToken || !sellerToken) {
  throw new Error('Uso: cash-shifts.mjs <baseUrl> <cajeraToken> <adminToken> <sellerToken>')
}

const BRANCH = 'branch-a-it'
const tenantHeaders = { 'x-tenant-id': 'tenant-a-it' }
let checks = 0

async function request(path, { method = 'GET', body, token = adminToken, tenant = 'tenant-a-it' } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(tenant ? { 'x-tenant-id': tenant } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
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

const expect = (result, status, label) => {
  assert.equal(result.response.status, status, `${label}: HTTP ${result.response.status} ${JSON.stringify(result.payload)}`)
  checks++
  return result.payload
}

const ts = Date.now()

// Producto propio del arnés: no toca el stock que verifican otras pruebas.
const producto = expect(
  await request('/api/products', { method: 'POST', body: { sku: `IT-CASH-SHIFT-${ts}`, name: 'Producto caja IT', category: 'Test', pricePyg: 100000, stock: 5, branchId: BRANCH } }),
  201,
  'alta de producto del arnés',
)

// ── Permisos y turno por usuario ───────────────────────────────────────────
expect(await request('/api/cash', { token: '' }), 401, 'caja sin sesión')
expect(await request(`/api/cash?branchId=${BRANCH}`, { token: sellerToken }), 403, 'vendedor sin permiso de caja')

const turnoCajera = expect(
  await request(`/api/cash?branchId=${BRANCH}`, { method: 'POST', token: cajeraToken, body: { action: 'open', openingPyg: 100000, notes: 'Turno IT cajera' } }),
  201,
  'apertura del turno de la cajera',
)
assert.ok(turnoCajera.id, 'la apertura devuelve el id del turno')
assert.ok(turnoCajera.publicToken, 'la apertura devuelve el token público del QR')
checks++
expect(
  await request(`/api/cash?branchId=${BRANCH}`, { method: 'POST', token: cajeraToken, body: { action: 'open', openingPyg: 100000 } }),
  409,
  'segundo turno abierto de la misma persona',
)

// Otra persona abre el suyo en la misma sucursal: ya no hay una sola caja.
const turnoAdmin = expect(
  await request(`/api/cash?branchId=${BRANCH}`, { method: 'POST', token: adminToken, body: { action: 'open', openingPyg: 50000, notes: 'Turno IT admin' } }),
  201,
  'apertura simultánea de otro usuario en la misma sucursal',
)
assert.notEqual(turnoAdmin.id, turnoCajera.id)
checks++

// El comprobante público del QR responde desde la apertura (turno abierto).
let publico = expect(await publicRequest(`/api/public/cash-sessions/${turnoCajera.publicToken}`), 200, 'verificación pública del turno abierto')
assert.equal(publico.estado, 'OPEN')
assert.equal(publico.aperturaPyg, 100000)
assert.equal(publico.diferenciaPyg, null, 'un turno abierto no tiene diferencia')
checks++
expect(await publicRequest('/api/public/cash-sessions/token-inexistente'), 404, 'token público inválido')

// ── Movimientos y cobro en efectivo del turno ──────────────────────────────
const venta = expect(
  await request('/api/orders', {
    method: 'POST',
    token: cajeraToken,
    body: {
      orderNumber: `IT-CASH-SHIFT-${ts}`,
      items: [{ productId: producto.id, description: producto.name, quantity: 1, unitPricePyg: 100000 }],
      payment: { method: 'CASH', amountPyg: 100000 },
    },
  }),
  201,
  'venta en efectivo de la cajera',
)
const movimiento = expect(
  await request(`/api/cash?branchId=${BRANCH}`, {
    method: 'POST',
    token: cajeraToken,
    body: { action: 'movement', kind: 'EXPENSE', direction: 'OUT', currency: 'PYG', originalAmount: 30000, exchangeRatePyg: 1, description: 'Gasto de caja IT' },
  }),
  201,
  'movimiento de caja del turno',
)
assert.equal(movimiento.status, 'CLEARED')
checks++

// Cierre inválido: el desglose rechaza denominaciones fuera de la lista.
expect(
  await request(`/api/cash?branchId=${BRANCH}`, { method: 'POST', token: cajeraToken, body: { action: 'close', countedBreakdown: { 12345: 1 } } }),
  400,
  'arqueo con denominación inválida',
)

// Esperado = 100.000 apertura + 100.000 cobro CASH − 30.000 salida = 170.000.
const cierre = expect(
  await request(`/api/cash?branchId=${BRANCH}`, {
    method: 'POST',
    token: cajeraToken,
    body: { action: 'close', countedBreakdown: { 100000: 1, 50000: 1, 20000: 1 }, notes: 'Cierre IT' },
  }),
  200,
  'cierre con arqueo por denominación',
)
assert.equal(cierre.expectedPyg, 170000, 'el esperado suma apertura, cobros y movimientos')
assert.equal(cierre.countedPyg, 170000, 'el contado sale del desglose')
assert.equal(cierre.differencePyg, 0, 'un arqueo exacto deja diferencia cero')
assert.deepEqual(cierre.countedBreakdown, { 100000: 1, 50000: 1, 20000: 1 }, 'el desglose queda persistido')
checks++

// ── Auditoría del cierre ───────────────────────────────────────────────────
const historial = expect(await request(`/api/cash/sessions/${turnoCajera.id}/history`, { token: adminToken }), 200, 'cronología del turno')
const eventos = Array.isArray(historial.events) ? historial.events : []
const cierreEvento = eventos.find((evento) => evento.action === 'Caja cerrada')
assert.ok(cierreEvento, 'la cronología registra el cierre')
assert.match(String(cierreEvento.detail), /Esperado Gs 170\.000 · contado Gs 170\.000 · diferencia Gs 0/, 'la cronología audita el arqueo y su diferencia')
assert.ok(eventos.some((evento) => /Salida de caja · Gasto/.test(evento.action)), 'la cronología lista el movimiento del turno')
checks++

// ── Diferencia negativa con total manual (sin desglose) ────────────────────
// El turno del admin no tiene cobros propios: esperado = apertura 50.000.
const cierreAdmin = expect(
  await request(`/api/cash?branchId=${BRANCH}`, { method: 'POST', token: adminToken, body: { action: 'close', countedPyg: 20000, notes: 'Cierre IT sin desglose' } }),
  200,
  'cierre sin desglose del turno del admin',
)
assert.equal(cierreAdmin.expectedPyg, 50000)
assert.equal(cierreAdmin.countedPyg, 20000)
assert.equal(cierreAdmin.differencePyg, -30000, 'el faltante queda negativo')
assert.equal(cierreAdmin.countedBreakdown, null)
checks++

// ── Comprobante público del cierre ─────────────────────────────────────────
publico = expect(await publicRequest(`/api/public/cash-sessions/${turnoCajera.publicToken}`), 200, 'verificación pública del cierre')
assert.equal(publico.estado, 'CLOSED')
assert.equal(publico.esperadoPyg, 170000)
assert.equal(publico.contadoPyg, 170000)
assert.equal(publico.diferenciaPyg, 0)
assert.equal(publico.cerradoPor, 'Caja A')
assert.deepEqual(publico.arqueo, [
  { valor: 100000, cantidad: 1, subtotal: 100000 },
  { valor: 50000, cantidad: 1, subtotal: 50000 },
  { valor: 20000, cantidad: 1, subtotal: 20000 },
])
// Los datos internos no viajan en la verificación pública.
assert.ok(!('notes' in publico) && !('movements' in publico) && !('payments' in publico))
checks++

// ── Auditoría de caja del día: el cobro del turno aparece en efectivo ──────
const fechaPago = new Date(venta.payments?.[0]?.paidAt || Date.now())
const fechas = [...new Set([fechaPago, new Date(Date.now() - 4 * 3600000)].map((dia) => dia.toISOString().slice(0, 10)))]
const auditorias = []
for (const fecha of fechas) {
  auditorias.push(expect(await request(`/api/cash/audit?branchId=${BRANCH}&date=${fecha}`, { token: cajeraToken }), 200, `auditoría de caja ${fecha}`))
}
const efectivo = auditorias
  .flatMap((auditoria) => (Array.isArray(auditoria.methods) ? auditoria.methods : []))
  .filter((fila) => fila.method === 'CASH')
assert.ok(efectivo.some((fila) => Number(fila.amountPyg) >= 100000), 'la auditoría del día lista el cobro en efectivo del turno')
checks++

console.log(`cash-shifts.mjs OK (${checks} verificaciones)`)
