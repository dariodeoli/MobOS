import assert from 'node:assert/strict'

// #455: el cliente entrega de más en efectivo (USD o Gs). Se guarda la entrega real en su moneda y un egreso de
// caja «Vuelto» en Gs ligado al pedido y al turno; el esperado se calcula POR MONEDA con la misma fórmula con
// signo en el cierre, el resumen por turno y la auditoría. Reintento idempotente, reembolso y corrección (#419).
//
// Uso: node cash-vuelto.mjs <baseUrl> <admin>
const [base, admin] = process.argv.slice(2)
if (!base || !admin) throw new Error('base y token admin requeridos')
const rama = 'branch-a-it'
const sufijo = Date.now().toString(36).toUpperCase()
let checks = 0
let secuencia = 0

async function call(path, method = 'GET', body, headers = {}) {
  const response = await fetch(base + path, {
    method,
    headers: { Authorization: `Bearer ${admin}`, 'x-forwarded-for': '203.0.113.77', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return { status: response.status, payload: await response.json().catch(() => null) }
}
async function ok(path, method, body, expected = 200, headers) {
  const result = await call(path, method, body, headers)
  assert.equal(result.status, expected, `${method} ${path}: ${JSON.stringify(result.payload)}`)
  checks++
  return result.payload
}
const clave = (etiqueta) => `vc-${sufijo}-${etiqueta}-${++secuencia}`.padEnd(16, '0')

// Turno propio y limpio: se cierra el que hubiera abierto y se abre uno con fondo conocido.
await call(`/api/cash?branchId=${rama}`, 'POST', { action: 'close', countedPyg: 0 })
const APERTURA = 2000000
const turno = await ok(`/api/cash?branchId=${rama}`, 'POST', { action: 'open', openingPyg: APERTURA }, 201)

const cajaPyg = await ok('/api/payment-accounts', 'POST', { name: `Efectivo vuelto ${sufijo}`, kind: 'CASH', currency: 'PYG' }, 201)
const cajaUsd = await ok('/api/payment-accounts', 'POST', { name: `Dólares vuelto ${sufijo}`, kind: 'CASH', currency: 'USD' }, 201)
const transferencia = await ok('/api/payment-accounts', 'POST', { name: `Transferencia vuelto ${sufijo}`, kind: 'TRANSFER', currency: 'PYG', bank: 'Banco sintético', holder: 'Empresa prueba', accountNumber: `VUE-${sufijo}` }, 201)
const producto = await ok('/api/products', 'POST', { name: `Producto vuelto ${sufijo}`, sku: `VUE-${sufijo}`, pricePyg: 1000000, stock: 50 }, 201)
const items = (monto) => [{ productId: producto.id, description: producto.name, quantity: 1, unitPricePyg: monto }]
const estado = async () => (await ok(`/api/cash?branchId=${rama}`)).session
const movimientosDe = async (orderId) => (await ok(`/api/cash?branchId=${rama}`)).movements.filter((movimiento) => movimiento.orderId === orderId)

const base0 = await estado()
assert.equal(base0.id, turno.id)
assert.equal(base0.expectedByCurrency.PYG, APERTURA, 'el esperado parte de la apertura')
assert.equal(base0.expectedByCurrency.USD, 0)

// ── 1. US$ 150 por una venta de Gs 1.000.000 (cotización 7.300): se aplican US$ 136,98 + Gs 46 de residuo ──
const pagosUsd = [
  { accountId: cajaUsd.id, originalAmount: '136.98', exchangeRatePyg: '7300', tenderedAmount: '150', status: 'CONFIRMED' },
  { accountId: cajaPyg.id, originalAmount: '46', exchangeRatePyg: '1', status: 'CONFIRMED' },
]
const claveOrden = clave('orden')
const orden = await ok('/api/orders', 'POST', { items: items(1000000), payments: pagosUsd }, 201, { 'Idempotency-Key': claveOrden })
assert.equal(orden.status, 'COMPLETED')
const pagoUsd = orden.payments.find((pago) => pago.currency === 'USD')
assert.equal(Number(pagoUsd.tenderedAmount), 150, 'se guarda la entrega real en dólares')
assert.equal(Number(pagoUsd.originalAmount), 136.98)
const VUELTO = Math.round(150 * 7300) - Number(pagoUsd.amountPyg) // 95.046
assert.equal(VUELTO, 95046)

const vueltos = await movimientosDe(orden.id)
assert.equal(vueltos.length, 1, 'un egreso «Vuelto» ligado al pedido')
assert.equal(vueltos[0].kind, 'CHANGE')
assert.equal(vueltos[0].direction, 'OUT')
assert.equal(vueltos[0].currency, 'PYG')
assert.equal(Number(vueltos[0].amountPyg), VUELTO)
assert.equal(vueltos[0].cashSessionId, turno.id, 'ligado al turno abierto')

// Esperado por moneda: USD +150 (lo que entró de verdad); Gs = apertura + 46 − vuelto (neto −95.000).
const tras1 = await estado()
assert.equal(tras1.expectedByCurrency.USD, 150)
assert.equal(tras1.expectedByCurrency.PYG, APERTURA + 46 - VUELTO)
assert.equal(tras1.expectedPyg, tras1.expectedByCurrency.PYG, 'el campo en Gs es el mismo número')

// Reintento idempotente con la misma clave del pedido: no duplica pago ni vuelto.
const repetida = await ok('/api/orders', 'POST', { items: items(1000000), payments: pagosUsd }, 200, { 'Idempotency-Key': claveOrden })
assert.equal(repetida.id, orden.id)
assert.equal((await movimientosDe(orden.id)).length, 1, 'el reintento no duplica el vuelto')
assert.equal((await estado()).expectedByCurrency.USD, 150)

// El corte por turno y la auditoría coinciden con Caja.
const hoy = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10)
const corte = (await ok(`/api/cash?sesiones=1&from=${hoy}&to=${hoy}&branchId=${rama}`)).sesiones.find((sesion) => sesion.id === turno.id)
assert.equal(corte.esperadoPorMoneda.USD, 150)
assert.equal(corte.esperadoPyg, corte.esperadoPorMoneda.PYG)
assert.equal(corte.esperadoPyg, APERTURA + 46 - VUELTO, 'el resumen por turno suma el vuelto como egreso')
const auditoria = await ok(`/api/cash/audit-operations?from=${hoy}&to=${hoy}&branchId=${rama}`)
assert.equal(auditoria.resumen.esperadoPorMoneda.USD, 150)
const operacionVuelto = auditoria.operaciones.find((operacion) => operacion.kind === 'MOVEMENT' && operacion.id === vueltos[0].id)
assert.ok(operacionVuelto && operacionVuelto.direction === 'OUT' && operacionVuelto.montoPyg === VUELTO, 'la auditoría lista el vuelto como egreso')
assert.equal(auditoria.resumen.esperadoPyg, auditoria.resumen.esperadoPorMoneda.PYG)

// «Cómo te pagaron» (por medio) sigue contando lo aplicado a la venta, no lo entregado.
const dia = await ok(`/api/cash/audit?date=${hoy}&branchId=${rama}`)
assert.equal(dia.cashByCurrency.USD, 150)
assert.equal(dia.methods.find((medio) => medio.method === 'CASH').amountPyg >= 1000000, true)

// ── 2. Validaciones de la entrega ──
const rechazos = [
  [{ accountId: cajaUsd.id, originalAmount: '136.98', exchangeRatePyg: '7300', tenderedAmount: '100' }, 'menor a lo aplicado'],
  [{ accountId: transferencia.id, originalAmount: '1000000', tenderedAmount: '1200000' }, 'solo efectivo'],
  [{ accountId: cajaPyg.id, originalAmount: '1000000', tenderedAmount: '1200000.5' }, 'entero en Gs'],
]
for (const [pago, motivo] of rechazos) {
  const respuesta = await call('/api/orders', 'POST', { items: items(1000000), payments: [{ ...pago, status: 'CONFIRMED' }] }, { 'Idempotency-Key': clave('rechazo') })
  assert.equal(respuesta.status, 400, `se rechaza (${motivo}): ${JSON.stringify(respuesta.payload)}`)
  checks++
}

// ── 3. Guaraníes: entrega 1.200.000 por 1.000.000 con cobro posterior (POST /api/payments) idempotente ──
const pendiente = await ok('/api/orders', 'POST', { items: items(1000000), payments: [] }, 201, { 'Idempotency-Key': clave('pendiente') })
const clavePago = clave('pago')
const cuerpoPago = { orderId: pendiente.id, accountId: cajaPyg.id, originalAmount: '1000000', tenderedAmount: '1200000', status: 'CONFIRMED' }
const pago = await ok('/api/payments', 'POST', cuerpoPago, 201, { 'Idempotency-Key': clavePago })
assert.equal(Number(pago.tenderedAmount), 1200000)
const pagoRepetido = await ok('/api/payments', 'POST', cuerpoPago, 201, { 'Idempotency-Key': clavePago })
assert.equal(pagoRepetido.id, pago.id)
const vueltosPyg = await movimientosDe(pendiente.id)
assert.equal(vueltosPyg.length, 1, 'el reintento del cobro no duplica el vuelto')
assert.equal(Number(vueltosPyg[0].amountPyg), 200000)
const tras3 = await estado()
assert.equal(tras3.expectedByCurrency.PYG, APERTURA + 46 - VUELTO + 1000000, 'entra 1.200.000 y sale el vuelto 200.000')
assert.equal(tras3.expectedByCurrency.USD, 150)

// ── 4. Corrección del medio (#419): el cobro en Gs con vuelto pasa a transferencia; el cajón queda neto ──
const correccion = await ok(`/api/orders/${pendiente.id}/payments/${pago.id}/correction`, 'POST', { reason: 'El cliente transfirió en vez de pagar en efectivo', payments: [{ accountId: transferencia.id, amount: 1000000 }] }, 201, { 'Idempotency-Key': clave('correccion') })
assert.ok(correccion.reversal)
const tras4 = await estado()
assert.equal(tras4.expectedByCurrency.PYG, APERTURA + 46 - VUELTO, 'efectivo 1.200.000 − vuelto 200.000 − reversión 1.000.000 = 0')
assert.equal(tras4.expectedByCurrency.USD, 150)

// ── 5. Reembolso en efectivo de la venta en USD: sale en Gs, los dólares siguen en la caja ──
await ok(`/api/orders/${orden.id}/return`, 'POST', { operation: 'RETURN', reason: 'Devolución con vuelto previo', refundPyg: 1000000, refundMode: 'CASH', restock: 'NONE' }, 200)
const tras5 = await estado()
assert.equal(tras5.expectedByCurrency.PYG, APERTURA + 46 - VUELTO - 1000000, 'el reembolso resta en guaraníes')
assert.equal(tras5.expectedByCurrency.USD, 150)

// ── 6. Cierre: se cuenta Gs y dólares; la diferencia por moneda es cero cuando lo físico coincide ──
const antesDeCerrar = await estado()
const cierre = await ok(`/api/cash?branchId=${rama}`, 'POST', { action: 'close', countedPyg: antesDeCerrar.expectedPyg, countedByCurrency: { USD: 150 } })
assert.equal(cierre.differencePyg, 0)
assert.equal(cierre.differenceByCurrency.PYG, 0)
assert.equal(cierre.differenceByCurrency.USD, 0, 'los dólares contados coinciden con el esperado')
assert.deepEqual(cierre.expectedByCurrency, { PYG: antesDeCerrar.expectedPyg, USD: 150 })
const cerrado = (await ok(`/api/cash?sesiones=1&from=${hoy}&to=${hoy}&branchId=${rama}`)).sesiones.find((sesion) => sesion.id === turno.id)
assert.equal(cerrado.esperadoPorMoneda.USD, 150, 'el resumen del turno cerrado conserva el esperado por moneda')
assert.equal(cerrado.contadoPorMoneda.USD, 150)

console.log(`Caja: vuelto y esperado por moneda (#455): ${checks} checks OK · pedido ${orden.orderNumber} · vuelto Gs ${VUELTO}`)
