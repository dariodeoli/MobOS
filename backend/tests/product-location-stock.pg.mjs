// Prueba de integración aislada para #557. Ejecutar con una base PostgreSQL
// descartable y migrada; nunca apunta a producción por sí sola.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const require = createRequire(import.meta.url)
require.extensions['.ts'] = (module, path) => module._compile(ts.transpileModule(readFileSync(path, 'utf8'), {
  compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, path)

const url = process.env.MOBOS_LOCATION_STOCK_DATABASE_URL || process.env.DATABASE_URL
if (!url) throw new Error('MOBOS_LOCATION_STOCK_DATABASE_URL es obligatorio para esta prueba aislada.')

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })
const suffix = randomUUID().slice(0, 8)
let tenantId
try {
  const tenant = await db.tenant.create({ data: { name: `QA #557 ${suffix}`, slug: `qa-557-${suffix}` } })
  tenantId = tenant.id
  const branch = await db.branch.create({ data: { tenantId, name: 'Sucursal QA #557' } })
  const location = await db.stockLocation.create({ data: { tenantId, branchId: branch.id, name: 'Depósito QA #557' } })
  const product = await db.product.create({ data: { tenantId, branchId: branch.id, sku: `QA-557-${suffix}`, name: 'Producto QA #557', pricePyg: 1000, stock: 10, stockKind: 'ACCESORIO' } })

  const { allocateProductStockToLocation, changeProductLocationStock, setProductLocationStock } = require('../lib/product-location-stock.ts')
  await db.$transaction(tx => allocateProductStockToLocation(tx, { tenantId, productId: product.id, locationId: location.id, quantity: 3 }))
  let current = await db.product.findUniqueOrThrow({ where: { id: product.id } })
  let balance = await db.productLocationBalance.findUniqueOrThrow({ where: { productId_locationId: { productId: product.id, locationId: location.id } } })
  assert.equal(current.stock, 10, 'asignar no altera el agregado de sucursal')
  assert.equal(balance.quantity, 3, 'asignar crea el saldo explícito')

  await db.$transaction(tx => setProductLocationStock(tx, { tenantId, productId: product.id, locationId: location.id, quantity: 5 }))
  current = await db.product.findUniqueOrThrow({ where: { id: product.id } })
  balance = await db.productLocationBalance.findUniqueOrThrow({ where: { productId_locationId: { productId: product.id, locationId: location.id } } })
  assert.equal(current.stock, 12, 'el conteo suma el delta al agregado')
  assert.equal(balance.quantity, 5, 'el conteo deja la cantidad física')

  await db.$transaction(tx => changeProductLocationStock(tx, { tenantId, productId: product.id, locationId: location.id, quantity: 0, delta: -1 }))
  current = await db.product.findUniqueOrThrow({ where: { id: product.id } })
  balance = await db.productLocationBalance.findUniqueOrThrow({ where: { productId_locationId: { productId: product.id, locationId: location.id } } })
  assert.equal(current.stock, 11, 'la salida reduce el agregado')
  assert.equal(balance.quantity, 4, 'la salida reduce la ubicación')
  assert.equal((await db.productLocationBalance.aggregate({ where: { tenantId, productId: product.id }, _sum: { quantity: true } }))._sum.quantity, 4, 'la suma de ubicaciones queda conciliable')
  console.log('PRODUCT_LOCATION_BALANCE_PG: 9 checks PASS', JSON.stringify({ branchStock: current.stock, locationQuantity: balance.quantity }))
} finally {
  if (tenantId) await db.tenant.delete({ where: { id: tenantId } }).catch(() => {})
  await db.$disconnect()
}
