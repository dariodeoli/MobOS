#!/usr/bin/env node
// Contract checks for seller privacy. This script never creates or mutates data.
// Usage: node seller-privacy.mjs <baseUrl> <tokenA> <companyTokenA> <tokenAdmin>

const [baseUrl, tokenA, companyTokenA, tokenAdmin] = process.argv.slice(2)
if (!baseUrl || !tokenA || !companyTokenA || !tokenAdmin) {
  console.error('Uso: seller-privacy.mjs <baseUrl> <tokenA> <companyTokenA> <tokenAdmin>')
  process.exit(2)
}

const ids = {
  order: process.env.SELLER_PRIVACY_OTHER_ORDER_ID,
  payment: process.env.SELLER_PRIVACY_OTHER_PAYMENT_ID,
}
const request = (token, path, init = {}) => fetch(new URL(path, baseUrl), {
  ...init,
  headers: { Authorization: `Bearer ${token}`, 'x-tenant-id': companyTokenA, ...(init.headers || {}) },
})
const expectStatus = async (response, expected, label) => {
  if (response.status !== expected) throw new Error(`${label}: esperado ${expected}, recibido ${response.status}`)
}

const ownOrders = await request(tokenA, '/api/orders')
await expectStatus(ownOrders, 200, 'VENDEDOR GET orders')
const orders = await ownOrders.json()
if (!process.env.SELLER_PRIVACY_SELLER_ID) throw new Error('Se requiere SELLER_PRIVACY_SELLER_ID')
if (!Array.isArray(orders) || orders.some((order) => order.sellerId !== process.env.SELLER_PRIVACY_SELLER_ID)) throw new Error('El vendedor recibió pedidos de otro vendedor')

if (ids.order) {
  const otherOrder = await request(tokenA, '/api/payments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: ids.order, amountPyg: 1, method: 'CASH' }) })
  if (![403, 404].includes(otherOrder.status)) throw new Error(`VENDEDOR acceso orden ajena: recibido ${otherOrder.status}`)
}
if (ids.payment) {
  for (const path of [`/api/payments/${encodeURIComponent(ids.payment)}/proofs`, `/api/payments/${encodeURIComponent(ids.payment)}/reconciliation`]) {
    const response = await request(tokenA, path)
    if (![403, 404].includes(response.status)) throw new Error(`VENDEDOR acceso financiero ajeno (${path}): recibido ${response.status}`)
  }
}

await expectStatus(await request(tokenA, '/api/users'), 403, 'VENDEDOR GET users')
await expectStatus(await request(tokenAdmin, '/api/users'), 200, 'ADMIN GET users')
await expectStatus(await request(tokenA, '/api/purchases'), 403, 'VENDEDOR GET purchases')
await expectStatus(await request(tokenA, '/api/warranties'), 403, 'VENDEDOR GET warranties')
console.log('seller privacy contract: PASS')
