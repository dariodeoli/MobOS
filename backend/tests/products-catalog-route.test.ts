import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { canSeeCost, redactProductCosts } from '../lib/cost-visibility'
import { catalogMeta, catalogSearchFilter, parseCatalogPage } from '../lib/product-catalog'
import { accessoryCatalogFilter, parseAccessoryCategory, parseCompatibleModels } from '../lib/product-accessories'
import { PRIMARY_IMAGE_INCLUDE, primaryImageFields } from '../lib/product-images'

// #354 · GET /api/products?page= : catálogo paginado con búsqueda en servidor.

const routePath = require.resolve('../app/api/products/route.ts')
const source = ts.transpileModule(readFileSync(routePath, 'utf8'), {
  compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText

let role = 'ADMIN'
let counts: Array<Record<string, any>> = []
let finds: Array<Record<string, any>> = []
const rows = Array.from({ length: 40 }, (_, index) => ({ id: `p${index}`, name: `Producto ${index}`, costPyg: 1000 + index, pricePyg: 5000, _count: { inventoryUnits: 1 } }))
const modules: Record<string, unknown> = {
  '@prisma/client': { PaymentCurrency: { PYG: 'PYG', USD: 'USD' }, ProductCondition: { NEW: 'NEW' } },
  '../../../lib/prisma': { prisma: {
    $transaction: async (fn: (tx: unknown) => unknown) => fn({}),
    product: {
      count: async (args: Record<string, any>) => { counts.push(args); return rows.length },
      findMany: async (args: Record<string, any>) => { finds.push(args); return rows.slice(args.skip ?? 0, (args.skip ?? 0) + args.take) },
    },
  } },
  '../../../lib/http': {
    json: (data: unknown, init?: ResponseInit) => Response.json(data, init),
    error: (message: string, status = 400) => Response.json({ message }, { status }),
    tenantId: async () => 'tenant-1',
  },
  '../../../lib/auth': {
    requireSession: async () => ({ user: { id: 'u1', tenantId: 'tenant-1', role, branchId: 'b1' } }),
    canAccessAny: () => true,
  },
  '../../../lib/sku': { skuUnico: async () => 'SKU' },
  '../../../lib/validation': { serialKey: (value: unknown) => value },
  '../../../lib/stock-kind': { classifyStockKind: () => 'ACCESSORY' },
  '../../../lib/stock': { promoteToEquipo: async () => undefined },
  '../../../lib/inventory': { INVENTORY_UNIT_RECEIVED: 'X', liberarReservasVencidas: async () => undefined },
  '../../../lib/montos': { LIMITE_MONTO_GENERAL: 1e12, numero: Number, numeroOpcional: Number },
  '../../../lib/sucursal-efectiva': { sucursalEfectiva: async () => 'b1' },
  // El dueño apagó "vendedores ven costos": mismas reglas reales, sin base de datos.
  '../../../lib/cost-visibility': { canSeeCostForSession: async (session: { user: { role: string } }) => canSeeCost(session.user.role, { permissions: { sellerSeesCosts: false } }), redactProductCosts },
  '../../../lib/product-catalog': { catalogMeta, catalogSearchFilter, parseCatalogPage },
  '../../../lib/product-accessories': { accessoryCatalogFilter, parseAccessoryCategory, parseCompatibleModels },
  '../../../lib/product-images': { PRIMARY_IMAGE_INCLUDE, primaryImageFields },
}
const routeExports: Record<string, unknown> = {}
runInNewContext(source, {
  exports: routeExports,
  URL,
  Promise,
  Number,
  Math,
  JSON,
  Array,
  Object,
  require: (name: string) => {
    assert.ok(Object.hasOwn(modules, name), `Unexpected import: ${name}`)
    return modules[name]
  },
})
const get = routeExports.GET as (request: Request) => Promise<Response>
const call = (query: string) => get(new Request(`https://api.example.test/api/products${query}`))

async function main() {
  // Helpers puros.
  assert.deepEqual(parseCatalogPage(new URLSearchParams('page=3&pageSize=16')), { page: 3, pageSize: 16, skip: 32 })
  assert.deepEqual(parseCatalogPage(new URLSearchParams('page=-4&pageSize=99999')), { page: 1, pageSize: 100, skip: 0 })
  assert.deepEqual(parseCatalogPage(new URLSearchParams('')), { page: 1, pageSize: 16, skip: 0 })
  assert.equal(catalogSearchFilter('   '), undefined)
  const fields = (catalogSearchFilter('iph')!.OR as Array<Record<string, unknown>>).map(clause => Object.keys(clause)[0])
  assert.deepEqual(fields, ['name', 'model', 'color', 'capacity', 'category', 'sku', 'imei'])
  assert.deepEqual(catalogMeta(40, 1, 16), { total: 40, page: 1, pageSize: 16, pages: 3 })

  // Página 2 de 16: salta 16, trae 16 y devuelve el total.
  role = 'ADMIN'
  const page2 = await call('?page=2&pageSize=16')
  const body = await page2.json()
  assert.equal(page2.status, 200)
  assert.equal(body.items.length, 16)
  assert.equal(body.items[0].id, 'p16')
  assert.deepEqual({ total: body.total, page: body.page, pageSize: body.pageSize, pages: body.pages }, { total: 40, page: 2, pageSize: 16, pages: 3 })
  assert.equal(finds.at(-1)!.skip, 16)
  assert.equal(finds.at(-1)!.take, 16)
  assert.equal(body.items[0].unitsCount, 1)
  assert.equal('_count' in body.items[0], false)

  // Tenant y activos siempre; la búsqueda llega al where del servidor.
  role = 'VENDEDOR'
  const search = await call('?page=1&q=iphone')
  assert.equal(search.status, 200)
  const where = JSON.parse(JSON.stringify(finds.at(-1)!.where))
  assert.deepEqual(where.AND[0], { tenantId: 'tenant-1', isActive: true })
  assert.equal(where.AND.length, 3, 'tenant + sucursal propia + búsqueda')
  assert.equal(JSON.stringify(where).includes('iphone'), true)
  assert.deepEqual(JSON.parse(JSON.stringify(counts.at(-1)!.where)), where, 'el total usa el mismo filtro')

  // Costos: ADMIN los ve; VENDEDOR/CAJERA sin permiso reciben null.
  role = 'ADMIN'
  assert.equal((await (await call('?page=1')).json()).items[0].costPyg, 1000)
  for (const restricted of ['VENDEDOR', 'CAJERA']) {
    role = restricted
    const out = await (await call('?page=1')).json()
    assert.ok(out.items.length > 0)
    for (const item of out.items) assert.equal(item.costPyg, null, restricted)
    assert.equal(out.items[0].pricePyg, 5000)
  }

  // Sin `page` el contrato anterior (arreglo) no cambia.
  role = 'ADMIN'
  const legacy = await (await call('?limit=5')).json()
  assert.equal(Array.isArray(legacy), true)
  assert.equal(legacy.length, 5)
  console.log('products-catalog-route: paging, search, tenant scope and cost redaction OK')
}

main().catch((failure) => { console.error(failure); process.exitCode = 1 })
