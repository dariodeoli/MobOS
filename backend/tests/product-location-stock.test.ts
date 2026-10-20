import assert from 'node:assert/strict'
import { assertLegacyStockMutationAllowed } from '../lib/product-location-stock'

const tx = (count: number) => ({ productLocationBalance: { count: async () => count } }) as any

void (async () => {
  await assertLegacyStockMutationAllowed(tx(0), 'tenant-1', 'product-1')
  await assert.rejects(
    () => assertLegacyStockMutationAllowed(tx(1), 'tenant-1', 'product-1'),
    /saldo por ubicación/,
  )
  console.log('product-location-stock: legacy writers fail closed when a location balance exists')
})()
