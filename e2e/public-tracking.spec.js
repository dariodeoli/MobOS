// Public order tracking API (no auth). The token comes from the order seeded
// by global-setup (e2e/.auth/seed-order.json).

import { test, expect, request as pwRequest } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const API = process.env.MOBOS_E2E_API_URL || `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`

function seedToken() {
  const data = JSON.parse(readFileSync(path.join(__dirname, '.auth', 'seed-order.json'), 'utf8'))
  return data.publicToken
}

test.describe('public tracking API', () => {
  test('GET /api/orders/public/:token returns the minimal public payload', async ({ request }) => {
    const token = seedToken()
    const res = await request.get(`${API}/api/orders/public/${token}`)
    expect(res.status()).toBe(200)

    const body = await res.json()
    expect(body.orderNumber).toBeTruthy()
    expect(body.customerName).toBeTruthy()
    expect(body.items).toBeInstanceOf(Array)
    for (const field of ['status', 'fulfillmentStatus', 'deliveryType', 'updatedAt']) {
      expect(body, `public payload must include ${field}`).toHaveProperty(field)
    }
    // El nivel rápido muestra el cobro (método e importe) pero nunca datos
    // internos ni de contacto: el token histórico equivale a "rápido".
    expect(body.level).toBe('rapido')
    expect(body.payments).toBeInstanceOf(Array)
    for (const payment of body.payments) {
      expect(Object.keys(payment).sort()).toEqual(['amountPyg', 'method', 'methodLabel', 'paidAt'])
    }
    for (const field of ['publicToken', 'phone', 'address', 'sellerId', 'tenantId', 'unitCostPyg', 'customer"']) {
      expect(JSON.stringify(body), `public payload must not include ${field}`).not.toContain(field)
    }
  })

  test('legacy GET /api/public/orders/:token redirects 308 to the new path', async ({ request }) => {
    const token = seedToken()
    const res = await request.get(`${API}/api/public/orders/${token}`, { maxRedirects: 0 })
    expect(res.status()).toBe(308)
    expect(res.headers()['location']).toContain(`/api/orders/public/${token}`)
  })

  test('unknown token returns 404', async ({ request }) => {
    const res = await request.get(`${API}/api/orders/public/does-not-exist-token`)
    expect(res.status()).toBe(404)
  })
})
