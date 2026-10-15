import assert from 'node:assert/strict'

// #461 — Datos y plata consistentes (HTTP, Postgres real):
//  1. Pagado/Saldo idénticos en el detalle del pedido, el listado de pedidos, la ficha del cliente y la
//     lista de clientes — con pagos divididos, una corrección de medio de pago (reversión + pago nuevo)
//     y el cobro del saldo.
//  2. Caja y auditoría de efectivo usan UNA definición de «esperado» (apertura + efectivo + ingresos − egresos).
//  3. Convertir una cotización toma un número de pedido NUEVO y único; el formato guardado no cambia.
//  4. Un saldo menor a un centavo de la moneda cobrada (Gs 7 por redondeo) se rechaza: no se cierra escondido.
//  5. El comprobante trae lo necesario: garantía en días por línea, vendedor y pagos en su moneda original.
//
// Uso: node datos-consistentes.mjs <baseUrl> <adminToken>
const [base, admin] = process.argv.slice(2)
if (!base || !admin) throw new Error('Faltan argumentos (ver encabezado).')
const sufijo = Date.now().toString(36).toUpperCase()
let checks = 0
let secuencia = 0

async function call(path, method = 'GET', body, headers = {}) {
  const response = await fetch(base + path, {
    method,
    headers: { Authorization: `Bearer ${admin}`, 'x-forwarded-for': '203.0.113.94', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const payload = await response.json().catch(() => null)
  return { status: response.status, payload }
}
async function ok(path, method, body, expected = 200, headers) {
  const result = await call(path, method, body, headers)
  assert.equal(result.status, expected, `${method} ${path}: ${JSON.stringify(result.payload)}`)
  checks++
  return result.payload
}
const clave = (etiqueta) => `dc-${sufijo}-${etiqueta}-${++secuencia}`.padEnd(16, '0')
const suma = (pagos) => pagos.filter((pago) => pago.status === 'CONFIRMED').reduce((total, pago) => total + Number(pago.amountPyg), 0)

// Cuentas y producto propios de la corrida.
const efectivo = await ok('/api/payment-accounts', 'POST', { name: `Efectivo datos ${sufijo}`, kind: 'CASH', currency: 'PYG' }, 201)
const transferencia = await ok('/api/payment-accounts', 'POST', { name: `Transferencia datos ${sufijo}`, kind: 'TRANSFER', currency: 'PYG', bank: 'Banco sintético', holder: 'Empresa prueba', accountNumber: '123456' }, 201)
const dolares = await ok('/api/payment-accounts', 'POST', { name: `Dólares datos ${sufijo}`, kind: 'CASH', currency: 'USD' }, 201)
const producto = await ok('/api/products', 'POST', { name: `Producto datos ${sufijo}`, sku: `DAT-${sufijo}`, pricePyg: 100000, stock: 50, condition: 'NEW' }, 201)
const cliente = await ok('/api/customers', 'POST', { name: `Cliente datos ${sufijo}`, phone: `09${String(Date.now()).slice(-8)}` }, 201)

const lineaPyg = (cuenta, monto) => ({ accountId: cuenta.id, originalAmount: String(monto), exchangeRatePyg: '1', amountPyg: monto, method: cuenta.kind, status: 'CONFIRMED' })
const item = (monto = 100000) => ({ productId: producto.id, description: producto.name, quantity: 1, unitPricePyg: monto })

// ── 1. Pagado/Saldo: una sola cuenta en todas las pantallas ──────────────────────────────────
async function lecturas(orderId, orderNumber, customerId) {
  const detalle = await ok(`/api/orders/${orderId}`, 'GET')
  const listado = (await ok(`/api/orders?q=${encodeURIComponent(orderNumber)}`, 'GET')).find((fila) => fila.id === orderId)
  assert.ok(listado, 'el listado de pedidos trae el pedido')
  const ficha = (await ok(`/api/customers/${customerId}`, 'GET')).orders?.find((fila) => fila.id === orderId)
    || (await ok(`/api/customers/${customerId}`, 'GET')).stats?.orders?.find?.((fila) => fila.id === orderId)
  assert.ok(ficha, 'la ficha del cliente trae el pedido')
  const total = Number(detalle.totalPyg)
  const pagado = suma(detalle.payments)
  return { total, pagado, pendiente: Math.max(0, total - pagado), listadoPagado: suma(listado.payments), ficha }
}
function igualar(lectura, esperado, etiqueta) {
  assert.equal(lectura.pagado, esperado.pagado, `${etiqueta}: pagado del detalle`)
  assert.equal(lectura.pendiente, esperado.pendiente, `${etiqueta}: saldo del detalle`)
  assert.equal(lectura.listadoPagado, esperado.pagado, `${etiqueta}: pagado del listado de pedidos`)
  assert.equal(Number(lectura.ficha.collectedPyg), esperado.pagado, `${etiqueta}: cobrado en la ficha del cliente`)
  assert.equal(Number(lectura.ficha.pendingPyg), esperado.pendiente, `${etiqueta}: saldo en la ficha del cliente`)
  checks += 5
}
async function deudaEnLista(customerId) {
  const filas = await ok(`/api/customers?q=${encodeURIComponent(cliente.name)}`, 'GET')
  const fila = filas.find((row) => row.id === customerId)
  assert.ok(fila, 'la lista de clientes trae la ficha')
  return Number(fila.stats?.pendingPyg ?? fila.debtPyg ?? fila.pendingPyg ?? 0)
}

const orden = await ok('/api/orders', 'POST', {
  customerId: cliente.id,
  items: [item()],
  payments: [lineaPyg(efectivo, 50000), lineaPyg(transferencia, 30000)],
}, 201, { 'Idempotency-Key': clave('orden') })
assert.equal(orden.status, 'PENDING', 'con saldo el pedido queda pendiente')
igualar(await lecturas(orden.id, orden.orderNumber, cliente.id), { pagado: 80000, pendiente: 20000 }, 'pagos divididos')
assert.equal(await deudaEnLista(cliente.id), 20000, 'la lista de clientes muestra la misma deuda')
checks++

// Corrección del medio de pago: la reversión resta por su signo y el pago nuevo suma; el total no cambia.
const original = orden.payments.find((pago) => Number(pago.amountPyg) === 50000)
await ok(`/api/orders/${orden.id}/payments/${original.id}/correction`, 'POST', {
  reason: 'Pagó por transferencia y no en efectivo',
  payments: [{ accountId: transferencia.id, amount: 50000 }],
}, 201, { 'Idempotency-Key': clave('correccion') })
igualar(await lecturas(orden.id, orden.orderNumber, cliente.id), { pagado: 80000, pendiente: 20000 }, 'tras corregir el medio')
assert.equal(await deudaEnLista(cliente.id), 20000)
checks++

// Cobrar el saldo: el pedido se completa y todas las pantallas dicen saldo 0.
await ok('/api/payments', 'POST', { orderId: orden.id, ...lineaPyg(efectivo, 20000) }, 201, { 'Idempotency-Key': clave('saldo') })
igualar(await lecturas(orden.id, orden.orderNumber, cliente.id), { pagado: 100000, pendiente: 0 }, 'tras cobrar el saldo')
assert.equal((await ok(`/api/orders/${orden.id}`, 'GET')).status, 'COMPLETED')
assert.equal(await deudaEnLista(cliente.id), 0)
checks += 2

// ── 2. Caja: un solo «esperado» ─────────────────────────────────────────────────────────────
// Se asegura un turno propio abierto y se compara el esperado de la pantalla de Caja con la definición.
// Si el admin ya tenía un turno propio abierto se lo cierra (si el abierto es de otra persona, el 409 se ignora).
await call('/api/cash', 'POST', { action: 'close', countedPyg: 0 })
const turno = await ok('/api/cash', 'POST', { action: 'open', openingPyg: 500000 }, 201)
const ordenEfectivo = await ok('/api/orders', 'POST', { items: [item(250000)], payments: [lineaPyg(efectivo, 250000)] }, 201, { 'Idempotency-Key': clave('efectivo') })
await ok('/api/orders', 'POST', { items: [item(100000)], payments: [lineaPyg(transferencia, 100000)] }, 201, { 'Idempotency-Key': clave('transf') })
assert.ok(ordenEfectivo.id)
const caja = await ok('/api/cash', 'GET')
const esperadoCaja = Number(caja.session?.expectedPyg ?? caja.expectedPyg)
// Apertura + efectivo en guaraníes (la transferencia no entra) ± movimientos del turno (aquí ninguno).
assert.equal(esperadoCaja, 500000 + 250000, 'el esperado de Caja = apertura + efectivo del turno')
checks++
const hoy = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10)
const auditoria = await ok(`/api/cash/audit-operations?from=${hoy}&to=${hoy}`, 'GET')
// La auditoría del rango usa la misma definición: apertura + efectivo recibido − salidas. Con un solo turno
// abierto en el día coincide con el de Caja si no hubo otros cobros en efectivo ese día en la sucursal.
const resumen = auditoria.resumen
assert.equal(resumen.esperadoPyg, resumen.aperturaPyg + resumen.recibidoPyg - (resumen.salidasPyg ?? 0) , 'el esperado del rango = inicial + recibido − salidas')
checks++
assert.ok(turno)
// Deja la caja como estaba: sin turno abierto de esta prueba.
await ok('/api/cash', 'POST', { action: 'close', countedPyg: esperadoCaja })

// ── 3. Cotización → pedido: número nuevo y único ───────────────────────────────────────────
const antes = await ok('/api/orders?limit=200', 'GET')
const numerosAntes = new Set(antes.map((fila) => fila.orderNumber))
const numeros = []
for (let indice = 0; indice < 3; indice += 1) {
  const cotizacion = await ok('/api/quotes', 'POST', { customerName: cliente.name, customerId: cliente.id, validUntil: new Date(Date.now() + 3 * 86400000).toISOString(), items: [{ productId: producto.id, description: 'Equipo cotizado', quantity: 1, unitPricePyg: 100000 }] }, 201)
  await ok('/api/quotes', 'PATCH', { id: cotizacion.id, status: 'SENT' })
  await ok('/api/quotes', 'PATCH', { id: cotizacion.id, status: 'ACCEPTED' })
  const pedido = await ok(`/api/quotes/${cotizacion.id}/convert`, 'POST', {}, 201)
  numeros.push(pedido.orderNumber)
  assert.ok(!numerosAntes.has(pedido.orderNumber), `${pedido.orderNumber}: la conversión no reutiliza un número ya usado`)
  assert.match(pedido.orderNumber, /^[A-Z]{2,3}-#\d{4,}$/, 'el formato guardado no cambia (PREFIJO-#0001)')
}
assert.equal(new Set(numeros).size, numeros.length, 'tres conversiones, tres números distintos')
checks += 3

// ── 4. Saldo menor a un centavo: no se cierra escondido ──────────────────────────────────────
// 13,60 USD × 7.350 = Gs 99.960 → quedan Gs 40 (< Gs 73,50 = un centavo): se rechaza y pide completar en Gs.
const usd = (monto) => ({ accountId: dolares.id, originalAmount: monto, exchangeRatePyg: '7350', method: 'CASH', status: 'CONFIRMED' })
const rechazada = await call('/api/orders', 'POST', { items: [item()], payments: [usd('13.60')] }, { 'Idempotency-Key': clave('residuo') })
assert.equal(rechazada.status, 422, JSON.stringify(rechazada.payload))
assert.match(rechazada.payload.message, /menor a un centavo/)
assert.match(rechazada.payload.message, /guaraníes/)
checks++
// Completando esos Gs 40 en efectivo en guaraníes la venta sí se cierra, sin saldo.
const cerrada = await ok('/api/orders', 'POST', { items: [item()], payments: [usd('13.60'), lineaPyg(efectivo, 40)] }, 201, { 'Idempotency-Key': clave('residuo-ok') })
assert.equal(cerrada.status, 'COMPLETED')
assert.equal(suma(cerrada.payments), 100000)
checks++
// Una venta parcial con un saldo grande en dólares sigue funcionando (no es un residuo de redondeo).
const parcial = await ok('/api/orders', 'POST', { items: [item()], payments: [usd('5.00')] }, 201, { 'Idempotency-Key': clave('parcial') })
assert.equal(parcial.status, 'PENDING')
// El cobro posterior del saldo tampoco puede dejar un residuo: 8,60 USD = Gs 63.210 → quedarían Gs 40.
const sobrante = await call('/api/payments', 'POST', { orderId: parcial.id, ...usd('8.60') }, { 'Idempotency-Key': clave('cobro-residuo') })
assert.equal(sobrante.status, 422, JSON.stringify(sobrante.payload))
assert.match(sobrante.payload.message, /menor a un centavo/)
checks++
await ok('/api/payments', 'POST', { orderId: parcial.id, ...lineaPyg(efectivo, 63250) }, 201, { 'Idempotency-Key': clave('cobro-gs') })
assert.equal((await ok(`/api/orders/${parcial.id}`, 'GET')).status, 'COMPLETED')
checks++

// ── 5. Comprobante: garantía por línea y datos del vendedor y de los pagos ───────────────────
const completa = await ok(`/api/orders/${cerrada.id}`, 'GET')
assert.ok(completa.seller?.name, 'el pedido trae el vendedor («Atendido por»)')
// Sin IMEI ni días propios del producto no se inventa garantía; los pagos en dólares conservan su moneda original.
const pagoUsd = completa.payments.find((pago) => pago.currency === 'USD')
assert.ok(pagoUsd, 'el pago en dólares conserva la moneda')
assert.equal(Number(pagoUsd.originalAmount), 13.6)
assert.equal(Number(pagoUsd.exchangeRatePyg), 7350)
assert.equal(Number(pagoUsd.amountPyg), 99960)
checks += 5
const conDias = await ok('/api/products', 'POST', { name: `Garantía datos ${sufijo}`, sku: `DAG-${sufijo}`, pricePyg: 100000, stock: 5, condition: 'NEW', warrantyDays: 180 }, 201)
const ordenGarantia = await ok('/api/orders', 'POST', { items: [{ productId: conDias.id, description: conDias.name, quantity: 1, unitPricePyg: 100000 }], payments: [lineaPyg(efectivo, 100000)] }, 201, { 'Idempotency-Key': clave('garantia') })
const detalleGarantia = await ok(`/api/orders/${ordenGarantia.id}`, 'GET')
assert.equal(detalleGarantia.items[0].warrantyDays, 180, 'los días de garantía del producto llegan por línea al comprobante')
assert.equal(detalleGarantia.receiptSnapshot?.datos?.items?.[0]?.warrantyDays, 180, 'y quedan congelados en el comprobante emitido')
assert.equal(completa.items[0].warrantyDays, undefined, 'una línea sin IMEI ni días propios no inventa garantía')
checks += 3

console.log(`PASS: datos consistentes (#461) — ${checks} verificaciones: saldos iguales en detalle/listado/ficha/lista de clientes con corrección y cobro de saldo, esperado de caja único, cotización → pedido con número nuevo, residuo sub-centavo rechazado y comprobante con garantía por línea.`)
