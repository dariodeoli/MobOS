// Listas de precios por cliente (issue #28): rutas reales contra PostgreSQL
// descartable. CRUD, prioridad de resolución, ítem por categoría, lista
// inactiva ignorada, asignación a la ficha y precio de lista congelado en la
// línea de la venta. Sin .env y sin acceso a ninguna base configurada.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { createServer } from 'node:net'
const require = createRequire(import.meta.url)
const backend = dirname(dirname(fileURLToPath(import.meta.url)))
const ts = require('typescript')
const pgBin = '/opt/homebrew/bin'
const port = await new Promise(resolve => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const port = s.address().port; s.close(() => resolve(port)) }) })
const root = mkdtempSync(join(tmpdir(), 'mobos-price-lists-'))
const pgdata = join(root, 'pgdata')
const url = `postgresql://postgres@127.0.0.1:${port}/price_lists_test`
const run = (bin, args, input) => execFileSync(join(pgBin, bin), args, { input, stdio: ['pipe','pipe','pipe'] })
let started = false, prisma, checks = 0
try {
  run('initdb', ['-D', pgdata, '--username=postgres', '--auth=trust', '--no-locale', '--encoding=UTF8'])
  run('pg_ctl', ['-D', pgdata, '-l', join(root, 'pg.log'), '-o', `-h 127.0.0.1 -p ${port} -k ${root}`, '-w', 'start']); started = true
  run('createdb', ['-h','127.0.0.1','-p',String(port),'-U','postgres','price_lists_test'])
  for (const e of readdirSync(join(backend, 'prisma/migrations'), { withFileTypes: true }).filter(e => e.isDirectory()).sort((a,b) => a.name.localeCompare(b.name))) run('psql', ['-X','-v','ON_ERROR_STOP=1',url], readFileSync(join(backend,'prisma/migrations',e.name,'migration.sql')))
  process.env.DATABASE_URL = url; process.env.NODE_ENV = 'test'
  require.extensions['.ts'] = (m,p) => m._compile(ts.transpileModule(readFileSync(p,'utf8'), { compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,p)
  ;({ prisma } = require('../lib/prisma.ts'))
  const { hashToken } = require('../lib/auth.ts')
  const lists = require('../app/api/price-lists/route.ts')
  const listById = require('../app/api/price-lists/[id]/route.ts')
  const pricing = require('../app/api/pricing/route.ts')
  const customers = require('../app/api/customers/route.ts')
  const customerById = require('../app/api/customers/[id]/route.ts')
  const order = require('../app/api/orders/route.ts')
  for (const tenant of ['a','b']) {
    await prisma.tenant.create({ data: { id:tenant,name:tenant,slug:tenant } })
    await prisma.branch.create({ data: { id:tenant,tenantId:tenant,name:tenant } })
    for (const role of ['ADMIN','VENDEDOR','CAJERA']) {
      const id = `${tenant}-${role}`
      await prisma.user.create({ data: { id,tenantId:tenant,branchId:tenant,name:id,role,pinHash:'unused' } })
      await prisma.session.create({ data: { tenantId:tenant,userId:id,level:'SELLER',deviceId:'test',tokenHash:hashToken(id),expiresAt:new Date(Date.now()+3600000) } })
    }
    await prisma.product.create({ data: { id:tenant,tenantId:tenant,branchId:tenant,sku:tenant,name:tenant,category:'Audio',pricePyg:100000,wholesalePricePyg:80000,stock:10 } })
  }
  await prisma.product.create({ data: { id:'a2',tenantId:'a',branchId:'a',sku:'a2',name:'Accesorio',category:'Accesorios',pricePyg:50000,stock:10 } })
  await prisma.product.create({ data: { id:'a-usd',tenantId:'a',branchId:'a',sku:'a-usd',name:'Dólar',pricePyg:0,priceUsd:25,stock:0 } })

  async function req(handler, { method = 'GET', token = 'a-ADMIN', url: requestUrl = 'http://localhost/api/price-lists', body, ctx, status = 200 } = {}) {
    const res = await handler(new Request(requestUrl, { method, headers: { Authorization: `Bearer ${token}`, 'x-tenant-id': 'b' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), ctx)
    const data = await res.json()
    assert.equal(res.status, status, JSON.stringify(data)); checks++
    return data
  }
  const priceOf = (productId, opts = {}) => req(pricing.GET, { url: `http://localhost/api/pricing?productId=${productId}&quantity=${opts.quantity || 1}${opts.customerId ? `&customerId=${opts.customerId}` : ''}`, token: opts.token || 'a-ADMIN' })

  await req(lists.GET, { token: 'missing', status: 401 })
  assert.deepEqual(await req(lists.GET, { token: 'a-VENDEDOR' }), [])
  await req(lists.POST, { method: 'POST', token: 'a-VENDEDOR', body: { name: 'Prohibida' }, status: 403 })
  await req(lists.POST, { method: 'POST', body: { name: 'Inválida', items: [{ scope: 'PRODUCT' }] }, status: 400 })
  await req(lists.POST, { method: 'POST', body: { name: 'Ajena', items: [{ scope: 'PRODUCT', productId: 'b', unitPricePyg: 1000 }] }, status: 400 })
  await req(lists.POST, { method: 'POST', body: { name: 'Doble', items: [{ scope: 'PRODUCT', productId: 'a', unitPricePyg: 1, discountPct: 5 }] }, status: 400 })

  const lista = await req(lists.POST, { method: 'POST', body: { name: 'Mayorista VIP', items: [
    { scope: 'PRODUCT', productId: 'a', unitPricePyg: 90000, tiers: [{ minQty: 3, unitPricePyg: 70000 }] },
    { scope: 'CATEGORY', category: 'Accesorios', discountPct: 10 },
  ] }, status: 201 })
  assert.equal(lista.items.length, 2)
  // #79: la moneda de la lista quedó eliminada; el USD vive en cada ítem.
  // El campo sigue por compatibilidad (deprecado, no interviene en la resolución).
  assert.equal(lista.currency, 'PYG', 'currency sigue presente con su default')
  assert.equal(lista._count.customers, 0)
  assert.equal(lista.items.find(i => i.scope === 'PRODUCT').tiers[0].unitPricePyg, 70000)

  // #77: el vendedor solo ve listas activas y sin el detalle ajeno. Sin
  // customerId recibe el listado mínimo; con customerId, solo la asignada.
  // La administración central decidió no exponer listas a vendedor/cajera: reciben listado vacío.
  assert.deepEqual(await req(lists.GET, { token: 'a-VENDEDOR' }), [])
  assert.deepEqual(await req(lists.GET, { token: 'a-CAJERA' }), [])
  await req(listById.GET, { token: 'a-VENDEDOR', ctx: { params: { id: lista.id } }, status: 403 })

  const sinLista = await priceOf('a')
  assert.equal(sinLista.origin, 'RETAIL'); assert.equal(sinLista.unitPricePyg, 100000)

  // Cliente mayorista con la lista: el ítem de lista gana sobre el mayorista.
  const cliente = await req(customers.POST, { method: 'POST', token: 'a-VENDEDOR', body: { name: 'Cliente VIP', pricingTier: 'WHOLESALE', priceListId: lista.id }, status: 201 })
  assert.equal(cliente.priceListId, lista.id)
  // La administración no expone listas a vendedor; el precio del cliente se
  // resuelve por /api/pricing (con su lista asignada).
  const asignada = await req(lists.GET, { url: `http://localhost/api/price-lists?customerId=${cliente.id}`, token: 'a-VENDEDOR' })
  assert.deepEqual(asignada, [])
  await req(lists.GET, { url: `http://localhost/api/price-lists?customerId=${cliente.id}`, token: 'a-CAJERA', status: 200 })
  // El vendedor no ve listas: aunque el cliente no exista, recibe vacío.
  assert.deepEqual(await req(lists.GET, { url: 'http://localhost/api/price-lists?customerId=inexistente', token: 'a-VENDEDOR' }), [])
  const conLista = await priceOf('a', { quantity: 2, customerId: cliente.id })
  assert.equal(conLista.origin, 'LIST'); assert.equal(conLista.unitPricePyg, 90000)
  const porCantidad = await priceOf('a', { quantity: 3, customerId: cliente.id })
  assert.equal(porCantidad.origin, 'TIER'); assert.equal(porCantidad.unitPricePyg, 70000); assert.equal(porCantidad.minQty, 3)
  assert.deepEqual(porCantidad.tiers, [{ minQty: 3, unitPricePyg: 70000 }])
  const categoria = await priceOf('a2', { customerId: cliente.id })
  assert.equal(categoria.origin, 'LIST'); assert.equal(categoria.unitPricePyg, 45000)
  assert.equal(categoria.priceList.name, 'Mayorista VIP')
  const enDolares = await priceOf('a-usd', { customerId: cliente.id })
  assert.equal(enDolares.origin, 'USD'); assert.equal(enDolares.currency, 'USD'); assert.equal(enDolares.unitPriceUsd, 25)
  assert.equal(enDolares.unitPricePygFallback, 0, 'sin retail el fallback también es cero')
  await req(pricing.GET, { url: 'http://localhost/api/pricing?productId=b', status: 404 })
  await req(pricing.GET, { url: 'http://localhost/api/pricing?quantity=0&productId=a', status: 400 })
  const conCliente = await priceOf('a', { quantity: 1, customerId: cliente.id })
  assert.equal(conCliente.origin, 'LIST'); assert.equal(conCliente.unitPricePyg, 90000)
  assert.equal(conCliente.customerId, cliente.id)

  // #78: el PATCH de ítems reemplaza la lista completa; sin `replaceItems` el
  // reemplazo implícito se rechaza con 400.
  await req(listById.PATCH, { method: 'PATCH', ctx: { params: { id: lista.id } }, body: { items: [{ scope: 'PRODUCT', productId: 'a2', unitPricePyg: 2000 }] }, status: 400 })
  await req(listById.PATCH, { method: 'PATCH', ctx: { params: { id: lista.id } }, body: { items: null } })

  // #79: un ítem en USD no cotiza en guaraníes y el fallback al retail vive en
  // pricing.ts: el endpoint lo devuelve y el POST de pedidos congela el mismo
  // valor para la misma resolución.
  await req(listById.PATCH, { method: 'PATCH', ctx: { params: { id: lista.id } }, body: { replaceItems: true, items: [{ scope: 'PRODUCT', productId: 'a', unitPriceUsd: 25 }] } })
  const usdDeLista = await priceOf('a', { customerId: cliente.id })
  assert.equal(usdDeLista.origin, 'USD'); assert.equal(usdDeLista.unitPricePygFallback, 100000, 'el fallback del endpoint es el retail')
  const pedidoUsd = await req(order.POST, { method: 'POST', token: 'a-VENDEDOR', url: 'http://localhost/api/orders', body: { customerId: cliente.id, orderNumber: 'PL-USD-001', items: [{ productId: 'a', description: 'Audio', quantity: 1, unitPricePyg: 100000 }] }, status: 201 })
  assert.equal(pedidoUsd.items[0].listPricePyg, 100000, 'el POST de pedidos usa el mismo fallback que /api/pricing')

  // Reemplazo de ítems: sin el ítem del producto cae al mayorista del cliente.
  await req(listById.PATCH, { method: 'PATCH', ctx: { params: { id: lista.id } }, body: { replaceItems: true, items: [{ scope: 'PRODUCT', productId: 'a2', unitPricePyg: 1000 }] } })
  const mayorista = await priceOf('a', { customerId: cliente.id })
  assert.equal(mayorista.origin, 'WHOLESALE'); assert.equal(mayorista.unitPricePyg, 80000)
  await req(listById.PATCH, { method: 'PATCH', ctx: { params: { id: lista.id } }, token: 'a-VENDEDOR', body: { name: 'No' }, status: 403 })
  await req(listById.PATCH, { method: 'PATCH', ctx: { params: { id: 'inexistente' } }, body: { name: 'No' }, status: 404 })
  await req(lists.POST, { method: 'POST', body: { name: 'Mayorista VIP' }, status: 409 })

  const detalle = await req(listById.GET, { ctx: { params: { id: lista.id } } })
  assert.equal(detalle.items[0].unitPricePyg, 1000)
  await req(listById.GET, { token: 'b-ADMIN', ctx: { params: { id: lista.id } }, status: 404 })

  // Venta: la línea congela el precio de lista resuelto (no el minorista).
  await req(listById.PATCH, { method: 'PATCH', ctx: { params: { id: lista.id } }, body: { replaceItems: true, items: [{ scope: 'PRODUCT', productId: 'a', unitPricePyg: 95000 }] } })
  const creada = await req(order.POST, { method: 'POST', token: 'a-VENDEDOR', url: 'http://localhost/api/orders', body: { customerId: cliente.id, orderNumber: 'PL-001', items: [{ productId: 'a', description: 'Audio', quantity: 1, unitPricePyg: 95000 }] }, status: 201 })
  assert.equal(creada.items[0].listPricePyg, 95000)

  // #78: un precio corrupto en la base no puede salir como 409/500: el POST de
  // pedidos mapea el PricingError a 400 con el mensaje del dato.
  await prisma.product.update({ where: { id: 'a' }, data: { pricePyg: -1 } })
  await req(order.POST, { method: 'POST', token: 'a-VENDEDOR', url: 'http://localhost/api/orders', body: { orderNumber: 'PL-PRICING-400', items: [{ productId: 'a', description: 'Audio', quantity: 1, unitPricePyg: 10000 }] }, status: 400 })
  await prisma.product.update({ where: { id: 'a' }, data: { pricePyg: 100000 } })

  // Lista inactiva: se ignora en la resolución y no se puede asignar.
  await req(listById.DELETE, { method: 'DELETE', ctx: { params: { id: lista.id } } })
  assert.deepEqual(await req(lists.GET, { token: 'a-VENDEDOR' }), [])
  const inactiva = await priceOf('a', { customerId: cliente.id })
  assert.equal(inactiva.origin, 'WHOLESALE'); assert.equal(inactiva.priceList, null)
  await req(customers.POST, { method: 'POST', body: { name: 'Cliente Tardío', pricingTier: 'WHOLESALE', priceListId: lista.id }, status: 404 })
  await req(customerById.PATCH, { method: 'PATCH', token: 'a-VENDEDOR', ctx: { params: { id: cliente.id } }, body: { priceListId: null } })
  const sinAsignacion = await prisma.customer.findUnique({ where: { id: cliente.id }, select: { priceListId: true } })
  assert.equal(sinAsignacion.priceListId, null)

  for (const action of ['PRICE_LIST_CREATED', 'PRICE_LIST_UPDATED', 'PRICE_LIST_DEACTIVATED']) {
    assert.equal(await prisma.auditLog.count({ where: { action, tenantId: 'a' } }) > 0, true)
    checks++
  }
  console.log(`Price lists: ${checks} route checks OK; PostgreSQL migrations, CRUD, priority (tier/list/wholesale/retail/USD), category items, inactive lists, customer assignment and frozen list price.`)
} finally {
  if(prisma) await prisma.$disconnect()
  if(started) run('pg_ctl',['-D',pgdata,'-m','fast','-w','stop'])
  rmSync(root,{recursive:true,force:true})
}
