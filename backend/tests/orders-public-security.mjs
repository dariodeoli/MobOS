import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'

// #172/#178 (dominio POS): el enlace de seguimiento del pedido ya no se guarda
// en claro en `Order.publicToken`. Nace como enlace de nivel rápido (reimprimible
// y rotable desde el panel), los enlaces legacy siguen resolviendo por hash (y
// por la columna vieja), «Regenerar acceso QR» rota todo y la superficie pública
// tiene rate limit.
const [base, adminToken, sellerToken, databaseUrl, pgBin = '/opt/homebrew/bin'] = process.argv.slice(2)
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

const sql = (sentencia) =>
  execFileSync(`${pgBin}/psql`, [databaseUrl, '-tAc', sentencia], { encoding: 'utf8' }).trim()

const producto = await call('/api/products', {
  method: 'POST',
  headers: adminHeaders,
  body: { sku: `IT-PUBTOKEN-${stamp}`, name: `Producto token ${stamp}`, pricePyg: 100000, stock: 3 },
})
assert.equal(producto.status, 201, JSON.stringify(producto.body))

const pedido = await call('/api/orders', {
  method: 'POST',
  body: {
    orderNumber: `IT-PUBTOKEN-${stamp}`,
    items: [{ productId: producto.body.id, description: `Token ${stamp}`, quantity: 1, unitPricePyg: 100000 }],
    payment: { method: 'CASH', amountPyg: 100000 },
  },
})
assert.equal(pedido.status, 201, JSON.stringify(pedido.body))
const orderId = pedido.body.id
const token = pedido.body.publicToken
assert.match(String(token), /^[a-f0-9]{64}$/, 'el enlace nuevo es de 64 hex')

// El token no se guarda en `Order` (ni en claro ni hasheado): queda como enlace
// de nivel rápido del pedido, que el panel puede listar y rotar.
const enBase = sql(`SELECT COALESCE("publicToken", '<null>') || '|' || COALESCE("publicTokenHash", '<null>') FROM "Order" WHERE id = '${orderId}'`)
assert.equal(enBase, '<null>|<null>', 'el token no se guarda en claro en el pedido')
const enlace = sql(`SELECT level || '|' || "impreso" || '|' || token FROM "OrderAccessToken" WHERE "orderId" = '${orderId}' AND "revokedAt" IS NULL`)
assert.equal(enlace, `rapido|false|${token}`, 'el enlace de seguimiento es un token de nivel rápido del pedido')

// El enlace funciona y el detalle del pedido no reexpone el token.
const publico = await call(`/api/orders/public/${token}`, { headers: {} })
assert.equal(publico.status, 200, JSON.stringify(publico.body))
assert.equal(publico.body.level, 'rapido')
const detalle = await call(`/api/orders/${orderId}`)
assert.equal(detalle.status, 200)
assert.ok(!detalle.body.publicToken, 'el detalle no reexpone el token histórico')

// Enlaces legacy ya entregados: resuelven por la columna vieja...
sql(`UPDATE "Order" SET "publicToken" = 'legacy-${stamp}' WHERE id = '${orderId}'`)
const legacy = await call(`/api/orders/public/legacy-${stamp}`, { headers: {} })
assert.equal(legacy.status, 200, 'el enlace legacy en claro sigue funcionando')
// ...y por el hash del backfill (el token en claro ya no está en la base).
const hashLegacy = createHash('sha256').update(`legacy-hash-${stamp}`).digest('hex')
sql(`UPDATE "Order" SET "publicToken" = NULL, "publicTokenHash" = '${hashLegacy}' WHERE id = '${orderId}'`)
const legacyHash = await call(`/api/orders/public/legacy-hash-${stamp}`, { headers: {} })
assert.equal(legacyHash.status, 200, 'el enlace legacy migrado a hash sigue funcionando')

// «Regenerar acceso QR» rota el acceso: mueren el enlace de creación, el legacy
// y el hash viejo; el token nuevo abre la vista pública.
const rotado = await call(`/api/orders/${orderId}/access-tokens`, {
  method: 'POST',
  body: { level: 'rapido', impreso: true, regenerate: true, revokeAll: true },
})
assert.equal(rotado.status, 200, JSON.stringify(rotado.body))
assert.equal((await call(`/api/orders/public/${token}`, { headers: {} })).status, 404, 'el enlace de creación quedó revocado')
assert.equal((await call(`/api/orders/public/legacy-${stamp}`, { headers: {} })).status, 404, 'el token legacy quedó invalidado')
assert.equal((await call(`/api/orders/public/legacy-hash-${stamp}`, { headers: {} })).status, 404, 'el hash legacy quedó invalidado')
assert.equal((await call(`/api/orders/public/${rotado.body.token}`, { headers: {} })).status, 200, 'el token regenerado abre la vista pública')
assert.equal(sql(`SELECT COALESCE("publicToken", '<null>') || '|' || COALESCE("publicTokenHash", '<null>') FROM "Order" WHERE id = '${orderId}'`), '<null>|<null>')

// El portal del cliente (CRM) sigue enlazando el comprobante: usa el enlace
// vigente de nivel rápido del pedido.
const cliente = await call('/api/customers', {
  method: 'POST',
  body: { name: `Portal token ${stamp}`, phone: `981${stamp.slice(-5)}1`, countryCode: '+595' },
})
assert.equal(cliente.status, 201, JSON.stringify(cliente.body))
const pedidoPortal = await call('/api/orders', {
  method: 'POST',
  body: {
    orderNumber: `IT-PUBTOKEN-PORTAL-${stamp}`,
    customerId: cliente.body.id,
    items: [{ productId: producto.body.id, description: `Token portal ${stamp}`, quantity: 1, unitPricePyg: 100000 }],
    payment: { method: 'CASH', amountPyg: 100000 },
  },
})
assert.equal(pedidoPortal.status, 201, JSON.stringify(pedidoPortal.body))
const cuenta = await call(`/api/customers/${encodeURIComponent(cliente.body.id)}/access-token`, {
  method: 'POST',
  body: { level: 'completo' },
})
assert.ok([200, 201].includes(cuenta.status), JSON.stringify(cuenta.body))
const portal = await call(`/api/portal/${cuenta.body.token}`, { headers: {} })
assert.equal(portal.status, 200, JSON.stringify(portal.body))
const pedidoEnPortal = portal.body.orders.find(order => order.orderNumber === pedidoPortal.body.orderNumber)
assert.equal(pedidoEnPortal.receiptToken, pedidoPortal.body.publicToken, 'el portal enlaza el comprobante con el enlace vigente del pedido')
assert.equal((await call(`/api/orders/public/${pedidoEnPortal.receiptToken}`, { headers: {} })).status, 200, 'el enlace del portal abre la vista pública')

// El aviso de WhatsApp por estado sigue llevando el enlace de seguimiento.
const avance = await call(`/api/orders/${pedidoPortal.body.id}`, { method: 'PATCH', body: { fulfillmentStatus: 'READY_FOR_PICKUP' } })
assert.equal(avance.status, 200, JSON.stringify(avance.body))
const aviso = await call(`/api/orders/${pedidoPortal.body.id}/whatsapp-message`)
assert.equal(aviso.status, 200, JSON.stringify(aviso.body))
assert.ok(aviso.body.message.includes(`/pedido/${pedidoPortal.body.publicToken}`), 'el aviso de WhatsApp lleva el enlace de seguimiento del pedido')

// Rate limit: con IP confiable, la ráfaga corta en 429 (30 por minuto).
const ip = `203.0.113.${Math.floor(Math.random() * 200) + 1}`
let ultimo = 0
for (let i = 1; i <= 32; i += 1) {
  const respuesta = await fetch(`${base}/api/orders/public/${rotado.body.token}`, { headers: { 'x-forwarded-for': ip } })
  ultimo = respuesta.status
  if (respuesta.status === 429) {
    assert.ok(i > 30, `la ráfaga cortó demasiado temprano (intento ${i})`)
    assert.ok(respuesta.headers.get('retry-after'), 'el 429 trae Retry-After')
    break
  }
}
assert.equal(ultimo, 429, 'la superficie pública corta la ráfaga con 429')

console.log('#172/#178: enlace de pedido sin token en claro, rotación, portal y rate limit OK.')
