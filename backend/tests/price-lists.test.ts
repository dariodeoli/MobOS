import assert from 'node:assert/strict'
import test from 'node:test'
import { parsePriceListItems } from '../lib/price-lists'
import { resolveUnitPrice } from '../lib/pricing'

test('items null o ausente no cambia la lista', () => {
  assert.equal(parsePriceListItems(undefined), undefined)
  assert.equal(parsePriceListItems(null), undefined)
  assert.deepEqual(parsePriceListItems([]), [])
})

test('categorías equivalentes no se pueden repetir (mayúsculas/acentos)', () => {
  assert.throws(() => parsePriceListItems([
    { scope: 'CATEGORY', category: 'Audio', unitPricePyg: 1000 },
    { scope: 'CATEGORY', category: 'audío', unitPricePyg: 2000 },
  ]))
})

test('cantidad por debajo del primer escalón cae al precio fijo del ítem', () => {
  const priceList = { items: [{ scope: 'CATEGORY', category: 'Audio', unitPricePyg: 90000, tiers: [{ minQty: 5, unitPricePyg: 80000 }] }] }
  // La categoría del producto va en minúsculas a propósito: el match es insensible.
  const pocas = resolveUnitPrice({ product: { category: 'audio', pricePyg: 100000 }, quantity: 1, priceList })
  assert.equal(pocas.origin, 'LIST')
  assert.equal(pocas.unitPricePyg, 90000)

  const alcanza = resolveUnitPrice({ product: { category: 'audio', pricePyg: 100000 }, quantity: 5, priceList })
  assert.equal(alcanza.origin, 'TIER')
  assert.equal(alcanza.unitPricePyg, 80000)
})
import { listPriceLists, readPriceList, createPriceList, PriceListServiceError } from '../lib/price-list-service'

test('MCP listas: lectura paginada queda limitada al tenant y al rol permitido', async () => {
  const calls: any[] = []
  const db = { priceList: { findMany: async (args: any) => { calls.push(args); return [{ id: 'a', tenantId: 't1', name: 'Mayorista' }, { id: 'b', tenantId: 't1', name: 'Retail' }] } } }
  const actor = { id: 'u1', tenantId: 't1', role: 'ADMIN' }
  const page = await listPriceLists(db as any, actor, { limit: 1 })
  assert.equal(page.items.length, 1)
  assert.equal(page.nextCursor, 'a')
  assert.equal(calls[0].where.tenantId, 't1')
  await assert.rejects(() => readPriceList(db as any, { ...actor, role: 'VENDEDOR' }, 'a'), (error: unknown) => error instanceof PriceListServiceError && error.code === 'forbidden')
})

test('MCP listas: crear valida productos del mismo tenant y registra auditoría', async () => {
  const audit: any[] = []
  const db = {
    product: { count: async () => 1 },
    priceList: { create: async (args: any) => ({ id: 'pl1', ...args.data, items: [] }) },
    auditLog: { create: async (args: any) => { audit.push(args); return args } },
  }
  const created = await createPriceList(db as any, { id: 'u1', tenantId: 't1', role: 'GERENTE' }, { name: 'Mayorista', replaceItems: true, items: [{ scope: 'PRODUCT', productId: 'p1', unitPricePyg: 1000 }] })
  assert.equal(created.id, 'pl1')
  assert.equal(audit[0].data.action, 'PRICE_LIST_CREATED')
  await assert.rejects(() => createPriceList(db as any, { id: 'u2', tenantId: 't1', role: 'VENDEDOR' }, { name: 'No' }), (error: unknown) => error instanceof PriceListServiceError && error.code === 'forbidden')
})
