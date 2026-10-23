import assert from 'node:assert/strict'
import { withItemThumbs } from '../lib/order-item-thumbs'

// Miniatura por línea del pedido: la imagen principal activa del producto, del mismo tenant,
// con una sola consulta; sin foto la línea queda igual.
const llamadas: unknown[] = []
const db = {
  productImage: {
    findMany: async (args: { where: { tenantId: string; productId: { in: string[] }; deletedAt: null } }) => {
      llamadas.push(args)
      return [{ id: 'img-a1', productId: 'prod-a' }, { id: 'img-a2', productId: 'prod-a' }]
    },
  },
}

async function main() {
  const pedido = { id: 'o1', items: [{ id: 'i1', productId: 'prod-a' }, { id: 'i2', productId: 'prod-b' }, { id: 'i3', productId: null }, { id: 'i4', productId: 'prod-a' }] }
  const resultado = await withItemThumbs(db, 'tenant-1', pedido) as typeof pedido & { items: Array<Record<string, unknown>> }
  assert.equal(llamadas.length, 1, 'una sola consulta por pedido')
  const consulta = llamadas[0] as { where: { tenantId: string; productId: { in: string[] } } }
  assert.equal(consulta.where.tenantId, 'tenant-1', 'siempre acotada por tenant')
  assert.deepEqual(consulta.where.productId.in, ['prod-a', 'prod-b'], 'productos sin repetir')
  assert.equal(resultado.items[0].thumbUrl, '/api/products/prod-a/images/img-a1?size=thumb', 'toma la primera imagen (la principal)')
  assert.equal(resultado.items[3].thumbUrl, '/api/products/prod-a/images/img-a1?size=thumb', 'misma foto para el mismo producto')
  assert.equal('thumbUrl' in resultado.items[1], false, 'producto sin foto queda igual')
  assert.equal('thumbUrl' in resultado.items[2], false, 'línea sin producto queda igual')
  const sinProductos = await withItemThumbs(db, 'tenant-1', { items: [{ id: 'x', productId: null }] })
  assert.equal(llamadas.length, 1, 'sin productos no consulta')
  assert.deepEqual(sinProductos, { items: [{ id: 'x', productId: null }] })
  console.log('order-item-thumbs.test.ts: ok')
}

main().catch((error) => { console.error(error); process.exit(1) })
