import assert from 'node:assert/strict'

// #280 — Gift cards reales: emisión con código (solo sha256 en la base), saldo,
// canje en pago dentro del pedido, canje posterior desde el cobro, historial por
// tarjeta y auditoría. Corre contra el seed del arnés: recibe base y token admin.
const [base, admin] = process.argv.slice(2)
if (!base || !admin) throw new Error('base y token admin requeridos')
let checks = 0
async function pedir(path, method, body, expected) {
  const response = await fetch(base + path, { method, headers: { Authorization: `Bearer ${admin}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })
  const data = await response.json().catch(() => null)
  return { response, data, expected }
}
async function req(path, method = 'GET', body, expected = 200) {
  // El arnés comparte el balde de rate limit por IP: un 429 transitorio no
  // debería fallar una aserción funcional (se reintenta con Retry-After).
  for (let intento = 0; intento < 3; intento += 1) {
    const { response, data } = await pedir(path, method, body, expected)
    if (response.status !== 429) {
      assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(data)}`)
      checks++
      return data
    }
    const espera = Math.min(65, Math.max(1, Number(response.headers.get('retry-after')) || 5))
    await new Promise((resolve) => setTimeout(resolve, espera * 1000))
  }
  throw new Error(`${method} ${path}: rate limit persistente`)
}

const sufijo = Date.now().toString(36).toUpperCase()
const monto = 100000
const [cuenta] = await req('/api/payment-accounts')
assert.ok(cuenta?.id, 'el arnés tiene una cuenta de cobro para la emisión')

// 1) Emisión: el código sale una sola vez y la tarjeta queda con su saldo.
const emitida = await req('/api/gift-cards', 'POST', { amountPyg: monto, accountId: cuenta.id, note: `QA ${sufijo}` }, 201)
assert.match(emitida.code, /^GC-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/, 'el código tiene formato GC y alfabeto Crockford')
assert.equal(Number(emitida.balancePyg), monto, 'la tarjeta nace con el saldo emitido')
assert.equal(emitida.status, 'ACTIVE')
assert.equal(emitida.codeLast4, emitida.code.slice(-4), 'los últimos 4 coinciden con el código')
const lista = await req('/api/gift-cards')
assert.ok(lista.some((fila) => fila.id === emitida.id), 'la tarjeta aparece en el listado')
assert.equal(lista.find((fila) => fila.id === emitida.id).codeHash, undefined, 'el listado nunca expone el hash ni el código')

// 2) Consulta por código: normaliza minúsculas y separadores.
const consulta = await req(`/api/gift-cards/lookup?code=${encodeURIComponent(emitida.code.toLowerCase().replace(/-/g, ' '))}`)
assert.equal(Number(consulta.balancePyg), monto, 'la consulta devuelve el saldo vigente')
assert.equal(consulta.status, 'ACTIVE')
await req('/api/gift-cards/lookup?code=GC-XXXX-XXXX-XXXX', 'GET', undefined, 404)
await req('/api/gift-cards/lookup?code=abc', 'GET', undefined, 400)

// 3) Canje en pago: la venta nace con parte en gift card y el saldo restante se
// cobra después con el mismo código (mismo motor que el POS, ruta de cobros).
const producto = await req('/api/products', 'POST', { name: `Producto gift ${sufijo}`, sku: `GIFT-${sufijo}`, pricePyg: 200000, stock: 5 }, 201)
const totalVenta = 200000
const primero = 60000
const venta = await req('/api/orders', 'POST', {
  items: [{ productId: producto.id, description: producto.name, quantity: 1, unitPricePyg: totalVenta }],
  payments: [{ method: 'GIFT_CARD', amountPyg: primero, status: 'CONFIRMED', giftCardCode: emitida.code }],
}, 201)
assert.equal(venta.payments?.[0]?.method, 'GIFT_CARD', 'el pago queda con método gift card')
assert.equal(venta.payments[0].reference, `GC ••${emitida.code.slice(-4)}`, 'la referencia guarda solo los últimos 4')
assert.equal(venta.status, 'PENDING', 'el pedido queda parcial')
const trasCanje = await req(`/api/gift-cards/${emitida.id}`)
assert.equal(Number(trasCanje.balancePyg), monto - primero, 'el saldo baja con el canje')
const movimientos = trasCanje.movements || []
assert.deepEqual(movimientos.map((movimiento) => movimiento.kind), ['ISSUE', 'REDEEM'], 'el historial explica emisión y canje')
const canje = movimientos[1]
assert.equal(Number(canje.amountPyg), primero)
assert.equal(Number(canje.balanceAfterPyg), monto - primero)
assert.equal(canje.order?.id, venta.id, 'el movimiento queda atado al pedido')
assert.equal(canje.payment?.id, venta.payments[0].id, 'y al cobro que lo aplicó')
assert.equal(movimientos[0].accountId, cuenta.id, 'la emisión guarda la cuenta que cobró')
assert.ok(movimientos[0].accountSnapshot?.name, 'la emisión guarda la foto de la cuenta')

// 4) Cobro posterior del saldo restante (POST /api/payments) y agotado.
const segundo = await req('/api/payments', 'POST', { orderId: venta.id, method: 'GIFT_CARD', amountPyg: monto - primero, status: 'CONFIRMED', giftCardCode: emitida.code }, 201)
assert.equal(segundo.method, 'GIFT_CARD')
assert.equal(Number((await req(`/api/gift-cards/${emitida.id}`)).balancePyg), 0, 'la tarjeta queda agotada')
await req('/api/payments', 'POST', { orderId: venta.id, method: 'GIFT_CARD', amountPyg: 1000, status: 'CONFIRMED', giftCardCode: emitida.code }, 409)
assert.equal(Number((await req(`/api/gift-cards/${emitida.id}`)).balancePyg), 0, 'el intento fallido no toca el saldo')

// 5) Anulación de gerencia: el saldo restante no se puede canjear.
const anulable = await req('/api/gift-cards', 'POST', { amountPyg: 25000 }, 201)
const anulada = await req(`/api/gift-cards/${anulable.id}`, 'PATCH', { action: 'cancel' })
assert.equal(anulada.status, 'CANCELLED', 'la tarjeta queda anulada')
assert.equal(Number(anulada.balancePyg), 0, 'la anulación deja el saldo en cero')
await req(`/api/gift-cards/${anulable.id}`, 'PATCH', { action: 'cancel' }, 409)
await req('/api/payments', 'POST', { orderId: venta.id, method: 'GIFT_CARD', amountPyg: 5000, status: 'CONFIRMED', giftCardCode: anulable.code }, 409)
const historialAnulada = await req(`/api/gift-cards/${anulable.id}`)
assert.deepEqual(historialAnulada.movements.map((movimiento) => movimiento.kind), ['ISSUE', 'CANCEL'], 'la anulación queda en el historial')

// 6) Auditoría: emisión, canjes y anulación con su rastro.
const auditoria = await req(`/api/audit?action=GIFT_CARD_ISSUED&limit=50`)
assert.ok(Array.isArray(auditoria), 'la auditoría devuelve una lista')
assert.ok(auditoria.some((fila) => fila.entityId === emitida.id), 'la emisión queda auditada')
const auditoriaCanje = await req(`/api/audit?action=GIFT_CARD_REDEEMED&limit=50`)
assert.ok(auditoriaCanje.some((fila) => fila.entityId === emitida.id), 'el canje queda auditado')

console.log(`PASS: gift cards — emisión, consulta, canje en pago, canje posterior, agotado, anulación e historial · ${checks} chequeos`)
