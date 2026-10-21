import assert from 'node:assert/strict'
import test from 'node:test'
import { updateProductPrice, ProductPriceError } from '../lib/product-price'

const user = { id: 'user-1', tenantId: 'tenant-a', role: 'ADMIN', branchId: null, permissions: ['products:manage'] } as any

test('rechaza tenant distinto antes de consultar la base', async () => {
  let calls = 0
  const db = { product: { findFirst: async () => { calls++; throw new Error('no debe consultar') } } }
  await assert.rejects(() => updateProductPrice({ tenantId: 'tenant-b', user, productId: 'p', pricePyg: 2000 }, db), (error: any) => error instanceof ProductPriceError && error.code === 'tenant_denied')
  assert.equal(calls, 0)
})

test('usa la base inyectada al devolver el producto sin auditoría', async () => {
  const returned = { id: 'p', tenantId: 'tenant-a', pricePyg: 2000 }
  const db: any = {
    product: {
      findFirst: async () => ({ id: 'p', tenantId: 'tenant-a', isActive: true, branchId: null, pricePyg: 1000 }),
      updateMany: async () => ({ count: 1 }),
      findUniqueOrThrow: async () => returned,
    },
    auditLog: { create: async () => ({}) },
  }
  db.$transaction = async (fn: any) => fn(db)
  const result = await updateProductPrice({ tenantId: 'tenant-a', user, productId: 'p', pricePyg: 2000, expectedPricePyg: 1000, includeAudit: false }, db)
  assert.strictEqual(result, returned)
})

console.log('product price unit tests: ok')
