import assert from 'node:assert/strict'

// POS offline-first (Fase 1): una venta sincronizada con `offline: true` se
// acepta aunque el stock local haya quedado viejo (stock laxo), descuenta solo
// lo disponible y queda marcada para revisión. Sin la marca el modo online no
// cambia: la misma venta se rechaza por stock. Además, el reenvío con la misma
// Idempotency-Key devuelve la orden ya creada (la cola no duplica).
const [base, adminToken, sellerToken] = process.argv.slice(2)
const conJson = { 'Content-Type': 'application/json' }
const adminHeaders = { Authorization: `Bearer ${adminToken}`, ...conJson }
const sellerHeaders = { Authorization: `Bearer ${sellerToken}`, ...conJson }
const stamp = Date.now().toString(36)

async function call(path, { method = 'GET', body, headers = sellerHeaders } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const payload = await response.json().catch(() => null)
  return { status: response.status, body: payload }
}

const stockDe = async (productId) => {
  const lista = await call('/api/products', { headers: adminHeaders })
  assert.equal(lista.status, 200, JSON.stringify(lista.body))
  return Number((lista.body || []).find((row) => row.id === productId)?.stock)
}

const producto = await call('/api/products', {
  method: 'POST',
  headers: adminHeaders,
  body: { sku: `IT-OFFLINE-${stamp}`, name: `Producto offline ${stamp}`, pricePyg: 100000, stock: 1 },
})
assert.equal(producto.status, 201, `El producto del caso debe crearse: ${JSON.stringify(producto.body)}`)
const productId = producto.body.id

// Modo online intacto: vender 3 con stock 1 se rechaza.
const ventaOnline = await call('/api/orders', {
  method: 'POST',
  body: {
    orderNumber: `IT-OFF-ONLINE-${stamp}`,
    items: [{ productId, description: 'Venta normal sin stock', quantity: 3, unitPricePyg: 100000 }],
  },
})
assert.equal(ventaOnline.status, 409, `Sin la marca offline el stock sigue estricto: ${JSON.stringify(ventaOnline.body)}`)
assert.equal(await stockDe(productId), 1, 'La venta rechazada no toca el stock.')

// Venta sincronizada desde la cola offline: se acepta, con stock laxo.
const key = `pos-offline-${stamp}-0001`
const ventaOffline = await call('/api/orders', {
  method: 'POST',
  headers: { ...sellerHeaders, 'Idempotency-Key': key },
  body: {
    offline: true,
    orderNumber: `IT-OFFLINE-${stamp}`,
    items: [{ productId, description: 'Venta sincronizada sin conexión', quantity: 3, unitPricePyg: 100000 }],
  },
})
assert.equal(ventaOffline.status, 201, `La venta offline debe aceptarse: ${JSON.stringify(ventaOffline.body)}`)
assert.ok(ventaOffline.body.offlineSyncedAt, 'La venta queda marcada como sincronizada sin conexión.')
assert.equal(await stockDe(productId), 0, 'El stock baja solo hasta lo disponible (nunca negativo).')

// Reintento con la misma clave: devuelve la orden ya creada, sin duplicar stock.
const replay = await call('/api/orders', {
  method: 'POST',
  headers: { ...sellerHeaders, 'Idempotency-Key': key },
  body: {
    offline: true,
    orderNumber: `IT-OFFLINE-${stamp}`,
    items: [{ productId, description: 'Venta sincronizada sin conexión', quantity: 3, unitPricePyg: 100000 }],
  },
})
assert.equal(replay.status, 200, JSON.stringify(replay.body))
assert.equal(replay.body.id, ventaOffline.body.id, 'El reintento reutiliza la orden ya creada.')
assert.equal(await stockDe(productId), 0, 'El reintento no descuenta stock de nuevo.')

// La marca es un booleano: un valor raro no se acepta.
const invalida = await call('/api/orders', {
  method: 'POST',
  body: {
    offline: 'si',
    orderNumber: `IT-OFF-BAD-${stamp}`,
    items: [{ productId, description: 'Marca inválida', quantity: 1, unitPricePyg: 100000 }],
  },
})
assert.equal(invalida.status, 400, JSON.stringify(invalida.body))

console.log('#131: venta offline con stock laxo, marca de revisión e idempotencia OK.')
