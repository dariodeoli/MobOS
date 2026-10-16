import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const require = createRequire(import.meta.url)
const backend = dirname(dirname(fileURLToPath(import.meta.url)))
const ts = require('typescript')
const pgBin = process.env.PG_BIN || '/opt/homebrew/bin'
const port = await new Promise(resolve => { const server = createServer(); server.listen(0, '127.0.0.1', () => { const value = server.address().port; server.close(() => resolve(value)) }) })
const root = mkdtempSync(join(tmpdir(), 'mobos-public403-'))
const pgdata = join(root, 'pgdata')
const dbUrl = `postgresql://postgres@127.0.0.1:${port}/public403_test`
const run = (bin, args, input) => execFileSync(join(pgBin, bin), args, { input, stdio: ['pipe', 'pipe', 'pipe'] })
let started = false, prisma, checks = 0
const ok = (value, label) => { assert.ok(value, label); checks++ }
try {
  run('initdb', ['-D', pgdata, '--username=postgres', '--auth=trust', '--no-locale', '--encoding=UTF8'])
  run('pg_ctl', ['-D', pgdata, '-l', join(root, 'pg.log'), '-o', `-h 127.0.0.1 -p ${port} -k ${root}`, '-w', 'start']); started = true
  run('createdb', ['-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', 'public403_test'])
  for (const entry of readdirSync(join(backend, 'prisma/migrations'), { withFileTypes: true }).filter(entry => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', dbUrl], readFileSync(join(backend, 'prisma/migrations', entry.name, 'migration.sql')))
  Object.assign(process.env, { DATABASE_URL: dbUrl, NODE_ENV: 'test', MOBOS_STORAGE_DIR: join(root, 'attachments'), MOBOS_APP_URL: 'https://app.example.test', MOBOS_AUTH_SECRET: 'cd'.repeat(32) })
  require.extensions['.ts'] = (module, path) => module._compile(ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, path)
  ;({ prisma } = require('../lib/prisma.ts'))
  const { GET: getRemito, POST: receiveRemito } = require('../app/api/transfers/public/[token]/route.ts')
  const tenant = await prisma.tenant.create({ data: { name: 'Tienda QA A', slug: 'qa403-a', email: 'a@example.test', phone: '0981999001' } })
  const branch = await prisma.branch.create({ data: { tenantId: tenant.id, name: 'Sucursal QA A', phone: '0981555001' } })
  const destination = await prisma.branch.create({ data: { tenantId: tenant.id, name: 'Destino QA A' } })
  const user = await prisma.user.create({ data: { tenantId: tenant.id, branchId: branch.id, name: 'Empleado QA', pinHash: 'sin-uso', role: 'ADMIN' } })
  const privateNote = 'NOTA-INTERNA-CANARIO-403'
  const privateReceived = 'RECEPCION-INTERNA-CANARIO-403'
  const transfer = await prisma.stockTransfer.create({ data: { tenantId: tenant.id, sourceBranchId: branch.id, destinationBranchId: destination.id, createdById: user.id, notes: privateNote, receivedNote: privateReceived } })
  const get = (handler, token) => handler(new Request(`https://api.example.test/public/${token}`), { params: Promise.resolve({ token }) })
  const response = await get(getRemito, transfer.publicToken)
  const remito = await response.json()
  ok(response.status === 200, 'remito anónimo abre con token válido')
  console.log('Canarios sintéticos persistidos en Remito; exposición notes/receivedNote:', JSON.stringify(remito).includes(privateNote), JSON.stringify(remito).includes(privateReceived))
  ok(!JSON.stringify(remito).includes(privateNote), 'nota interna del traslado no llega al DTO público')
  ok(!JSON.stringify(remito).includes(privateReceived), 'nota interna de recepción no llega al DTO público')
  ok(!('notes' in remito) && !('receivedNote' in remito), 'DTO ni siquiera ofrece campos de notas internas')
  const stored = await prisma.stockTransfer.findUnique({ where: { id: transfer.id } })
  ok(stored.notes === privateNote && stored.receivedNote === privateReceived, 'GET no borra ni altera notas internas persistidas')
  ok((await get(getRemito, 'inexistente')).status === 404, 'un token distinto no permite leer traslado')
  const received = await receiveRemito(new Request('https://api.example.test/public/receive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'receive', note: 'Recepción QA propia', serialsOk: [] }) }), { params: Promise.resolve({ token: transfer.publicToken }) })
  ok(received.status === 200, 'recepción pública sigue funcionando')
  const after = await prisma.stockTransfer.findUnique({ where: { id: transfer.id } })
  ok(after.notes === privateNote && after.receivedNote === 'Recepción QA propia' && after.receivedAt, 'recepción conserva observaciones internas y guarda nota propia como antes')
  ok(await prisma.auditLog.count({ where: { entityId: transfer.id, action: 'STOCK_TRANSFER_RECEIVED' } }) === 1, 'recepción mantiene auditoría única')
  const dtoAfter = await (await get(getRemito, transfer.publicToken)).json()
  ok(dtoAfter.status === 'RECEIVED' && !('notes' in dtoAfter) && !('receivedNote' in dtoAfter), 'reabrir confirma recepción sin exponer notas persistidas')
  const repeated = await receiveRemito(new Request('https://api.example.test/public/receive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'receive' }) }), { params: Promise.resolve({ token: transfer.publicToken }) })
  ok(repeated.status === 409, 'recepción repetida conserva idempotencia/conflicto')
  const { GET: getCart } = require('../app/api/suspended-sales/public/[token]/route.ts')
  const { GET: cartLogo } = require('../app/api/suspended-sales/public/[token]/logo/route.ts')
  const { GET: getReport } = require('../app/api/public/units/[serial]/route.ts')
  const { GET: reportLogo } = require('../app/api/public/units/[serial]/logo/route.ts')
  const { GET: getAlternative } = require('../app/api/public/supply/alternatives/[token]/route.ts')
  const { GET: alternativeLogo } = require('../app/api/public/supply/alternatives/[token]/logo/route.ts')
  const hash = token => createHash('sha256').update(token).digest('hex')
  const other = await prisma.tenant.create({ data: { name: 'OTRA-TIENDA-PRIVADA-403', slug: 'qa403-b', email: 'b@example.test', phone: '0981999002' } })
  const otherBranch = await prisma.branch.create({ data: { tenantId: other.id, name: 'OTRA-SUCURSAL-403', phone: '0981555002' } })
  const product = await prisma.product.create({ data: { tenantId: tenant.id, branchId: branch.id, sku: 'QA403-PROD', name: 'Equipo público QA', pricePyg: 1000000, costPyg: 876543210, stock: 2 } })
  const productB = await prisma.product.create({ data: { tenantId: other.id, branchId: otherBranch.id, sku: 'QA403-PROD-B', name: 'MODELO-AJENO-403', pricePyg: 2000000, costPyg: 765432109 } })
  const customer = await prisma.customer.create({ data: { tenantId: tenant.id, name: 'Cliente QA', phone: '0981777003', notes: privateNote } })
  const supplier = await prisma.supplier.create({ data: { tenantId: tenant.id, name: 'PROVEEDOR-PRIVADO-403', notes: privateNote } })
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5l8AAAAASUVORK5CYII=', 'base64')
  const logos = new Map()
  for (const [owner, variants] of [[tenant, ['light', 'dark']], [other, ['light']]]) for (const variant of variants) {
    const data = Buffer.concat([png, Buffer.from(`${owner.id}-${variant}`)])
    logos.set(`${owner.id}:${variant}`, data)
    await prisma.tenantLogo.create({ data: { tenantId: owner.id, variant, mimeType: 'image/png', data } })
  }
  const publicCall = (handler, key, value, query = '') => handler(new Request(`https://api.example.test/public/${encodeURIComponent(value)}${query}`), { params: Promise.resolve({ [key]: value }) })
  const expectLogo = async (handler, key, value, owner, variant = 'light') => {
    const response = await publicCall(handler, key, value, `?variant=${variant}&tenantId=${other.id}`)
    ok(response.status === 200 && response.headers.get('Content-Type') === 'image/png', 'logo válido usa MIME de imagen almacenada')
    ok(Buffer.from(await response.arrayBuffer()).equals(logos.get(`${owner.id}:${variant}`) || logos.get(`${owner.id}:light`)), 'logo corresponde al documento, no a tenantId elegido por query')
    ok(response.headers.get('Cache-Control') === 'no-store' && response.headers.get('X-Content-Type-Options') === 'nosniff', 'logo no persiste después de revocar acceso')
  }
  const noPrivate = (payload, label) => {
    const json = JSON.stringify(payload)
    for (const canary of [privateNote, privateReceived, 'PROVEEDOR-PRIVADO-403', 'MOV-987654', '876543210', '0981777003', other.name, otherBranch.name, productB.name]) ok(!json.includes(canary), `${label}: no expone ${canary}`)
    for (const field of ['tenantId', 'supplierId', 'supplierName', 'costPyg', 'unitCostPyg', 'internalSeq', 'publicTokenHash', 'otpCodeHash', 'otpAttempts']) ok(!json.includes(`"${field}":`), `${label}: no expone campo privado ${field}`)
  }
  const cartToken = 'a'.repeat(64)
  const cart = await prisma.suspendedSale.create({ data: { tenantId: tenant.id, branchId: branch.id, customerId: customer.id, userId: user.id, publicTokenHash: hash(cartToken), publicTokenExpiresAt: new Date(Date.now() + 600000), payload: { items: [{ productoId: product.id, nombre: product.name, quantity: 1, precio: 1000000, costo: 876543210, supplierName: supplier.name, internalCode: 'MOV-987654' }], interno: privateNote } } })
  let cartData = await (await publicCall(getCart, 'token', cartToken)).json()
  ok(cartData.contacto.whatsapp === '595981555001' && cartData.checkoutUrl.startsWith('https://wa.me/595981555001?'), 'carrito usa sucursal, nunca teléfono de tenant/cliente')
  noPrivate(cartData, 'Carrito')
  await expectLogo(cartLogo, 'token', cartToken, tenant)
  await expectLogo(cartLogo, 'token', cartToken, tenant, 'dark')
  await prisma.branch.update({ where: { id: branch.id }, data: { phone: null } })
  cartData = await (await publicCall(getCart, 'token', cartToken)).json()
  ok(cartData.contacto === null && cartData.checkoutUrl === null, 'sin teléfono de sucursal no inventa WhatsApp ni recurre al tenant/cliente')
  await prisma.branch.update({ where: { id: branch.id }, data: { phone: '0981555001' } })
  await prisma.$executeRaw`UPDATE "SuspendedSale" SET "publicTokenExpiresAt" = now() - interval '1 minute' WHERE id = ${cart.id}`
  ok((await publicCall(cartLogo, 'token', cartToken)).status === 410, 'logo de carrito vencido usa mismo reloj PG y denegación que documento')
  await prisma.suspendedSale.update({ where: { id: cart.id }, data: { publicTokenHash: null } })
  ok((await publicCall(cartLogo, 'token', cartToken)).status === 404, 'logo de carrito revocado deja de abrir')

  const serial = 'QA403-SERIAL-COMPARTIDO'
  const unit = await prisma.inventoryUnit.create({ data: { tenantId: tenant.id, branchId: branch.id, productId: product.id, serial, supplierId: supplier.id, supplierName: supplier.name, notes: privateNote + ' MOV-987654', internalSeq: 987654, costPyg: 876543210, lastVerifiedAt: new Date('2026-01-01') } })
  await prisma.inventoryUnit.create({ data: { tenantId: other.id, branchId: otherBranch.id, productId: productB.id, serial, lastVerifiedAt: new Date('2026-02-01') } })
  const report = () => publicCall(getReport, 'serial', serial, '?preview=1')
  ok((await (await report()).json()).store.name === other.name, 'sin venta informe elige verificación más reciente entre seriales ambiguos')
  await expectLogo(reportLogo, 'serial', serial, other, 'dark')
  const order = await prisma.order.create({ data: {
    tenantId: tenant.id, branchId: branch.id, sellerId: user.id, orderNumber: 'QA403-ORDER', subtotalPyg: 1000000, totalPyg: 1000000, notes: privateNote,
    items: { create: { productId: product.id, description: product.name, quantity: 1, unitPricePyg: 1000000, unitCostPyg: 876543210, totalPyg: 1000000, serialsList: { create: { serial } } } },
  } })
  ok(Boolean(order.id && unit.id), 'unidades y venta persistidas antes de negativos')
  const reportData = await (await report()).json()
  ok(reportData.store.name === tenant.name && reportData.contacto.whatsapp === '595981555001', 'venta de A prevalece sobre verificación de B; contacto pertenece a la misma unidad')
  noPrivate(reportData, 'Informe')
  await prisma.inventoryUnit.update({ where: { id: unit.id }, data: { branchId: null } })
  const reportWithSaleBranch = await (await report()).json()
  ok(reportWithSaleBranch.store.branch === branch.name && reportWithSaleBranch.contacto.whatsapp === '595981555001', 'sin sucursal en unidad usa sucursal real de su venta, nunca tenant/cliente')
  await expectLogo(reportLogo, 'serial', serial, tenant)
  await expectLogo(reportLogo, 'serial', serial, tenant, 'dark')
  ok((await publicCall(reportLogo, 'serial', 'QA-NO-EXISTE')).status === 404, 'logo por serial inexistente no expone empresa')

  const need = await prisma.supplyNeed.create({ data: { tenantId: tenant.id, branchId: branch.id, productId: product.id, customerId: customer.id, quantity: 1, source: 'MANUAL', createdById: user.id, notes: privateNote } })
  const alternativeToken = 'b'.repeat(64)
  const alternative = await prisma.supplyAlternative.create({ data: { tenantId: tenant.id, supplyNeedId: need.id, version: 1, status: 'ENVIADA_AL_CLIENTE', optionSummary: 'Variante pública QA', priceDeltaPyg: 100000, notes: privateNote + ' MOV-987654', publicTokenHash: hash(alternativeToken), otpCodeHash: hash('123456'), otpExpiresAt: new Date(Date.now() + 600000) } })
  const alternativeData = await (await publicCall(getAlternative, 'token', alternativeToken)).json()
  ok(alternativeData.store.name === tenant.name && alternativeData.contacto.whatsapp === '595981555001', 'alternativa publica nombre y contacto de sucursal de su necesidad')
  noPrivate(alternativeData, 'Alternativa')
  await expectLogo(alternativeLogo, 'token', alternativeToken, tenant)
  await expectLogo(alternativeLogo, 'token', alternativeToken, tenant, 'dark')
  await prisma.supplyAlternative.update({ where: { id: alternative.id }, data: { publicTokenHash: null } })
  ok((await publicCall(alternativeLogo, 'token', alternativeToken)).status === 404, 'logo de alternativa revocada no abre')
  for (const handler of [cartLogo, alternativeLogo]) ok((await publicCall(handler, 'token', 'inexistente')).status === 404, 'logo rechaza token inválido')
  await prisma.stockTransferLine.create({ data: { transferId: transfer.id, sourceProductId: product.id, destinationProductId: product.id, quantity: 1, serials: [serial] } })
  noPrivate(await (await get(getRemito, transfer.publicToken)).json(), 'Remito')
  // #403: logos de garantía/remito autorizados por sus resolutores reales.
  const { GET: warrantyDoc } = require('../app/api/public/warranty/[token]/route.ts')
  const { GET: warrantyLogo } = require('../app/api/public/warranty/[token]/logo/route.ts')
  const { GET: transferLogo } = require('../app/api/transfers/public/[token]/logo/route.ts')
  const legacy32 = 'c'.repeat(32), hashed64 = 'd'.repeat(64)
  const warrantyA = await prisma.warrantyCase.create({ data: { id:'qa403-warranty-a', tenantId:tenant.id, branchId:branch.id, customerName:'Cliente ficticio A', serial:'QA-GAR-403-A', description:'Equipo A', publicToken:legacy32, expiresAt:new Date(Date.now()-86400000), repairCostPyg:876543210, diagnosis:privateNote } })
  const warrantyB = await prisma.warrantyCase.create({ data: { id:'qa403-warranty-b', tenantId:other.id, branchId:otherBranch.id, customerName:'Cliente ficticio B', serial:'QA-GAR-403-B', description:'Equipo B', publicTokenHash:hash(hashed64) } })
  const dtoA = await (await publicCall(warrantyDoc,'token',legacy32)).json()
  ok(dtoA.company.name===tenant.name && dtoA.company.logo && dtoA.daysRemaining===0,'garantía vencida sigue visible, con marca autorizada A')
  noPrivate(dtoA,'Garantía')
  const backfillAntes=(await prisma.warrantyCase.findUnique({where:{id:warrantyA.id}})).publicTokenHash
  ok(backfillAntes===hash(legacy32),'GET conserva backfill legacy existente')
  for(const variant of ['light','dark']) {
    await expectLogo(warrantyLogo,'token',legacy32,tenant,variant)
    await expectLogo(warrantyLogo,'token',hashed64,other,variant)
    await expectLogo(transferLogo,'token',transfer.publicToken,tenant,variant)
  }
  const docB=await (await publicCall(warrantyDoc,'token',hashed64)).json()
  ok(docB.company.name===other.name && !JSON.stringify(docB).includes(tenant.name),'hash64 resuelve empresa B sin mezclar A')
  const destinationB=await prisma.branch.create({data:{tenantId:other.id,name:'Destino ficticio B'}})
  const transferB=await prisma.stockTransfer.create({data:{tenantId:other.id,sourceBranchId:otherBranch.id,destinationBranchId:destinationB.id,createdById:(await prisma.user.create({data:{tenantId:other.id,name:'Persona B',pinHash:'sin-uso',role:'ADMIN'}})).id,publicToken:'e'.repeat(32)}})
  await expectLogo(transferLogo,'token',transferB.publicToken,other,'dark')
  const remitoB=await (await publicCall(getRemito,'token',transferB.publicToken)).json()
  ok(remitoB.company.name===other.name && !JSON.stringify(remitoB).includes(tenant.name),'remitoB usa empresa de fila, no inputcliente')
  for(const [doc,logo,valid] of [[warrantyDoc,warrantyLogo,legacy32],[warrantyDoc,warrantyLogo,hashed64],[getRemito,transferLogo,transferB.publicToken]]) {
    for(const token of ['inexistente',valid+'ÿ']) {
      ok((await publicCall(doc,'token',token)).status===404,'documento rechaza token inválido o sufijo sin recortar')
      const denied=await publicCall(logo,'token',token,`?tenantId=${tenant.id}`)
      ok(denied.status===404 && denied.headers.get('Cache-Control')==='no-store','logo denegado no cachea ni acepta tenantId de query')
    }
  }
  await prisma.warrantyCase.update({where:{id:warrantyB.id},data:{publicTokenHash:null}})
  ok((await publicCall(warrantyLogo,'token',hashed64)).status===404,'revocar hash invalida logo sin backfill alternativo')
  await prisma.stockTransfer.update({where:{id:transferB.id},data:{publicToken:null}})
  ok((await publicCall(transferLogo,'token',transferB.publicToken)).status===404,'retirar token remito invalida imagen')
  const warrantySinBackfill=await prisma.warrantyCase.create({data:{id:'qa403-warranty-nobackfill',tenantId:tenant.id,branchId:branch.id,customerName:'Cliente QA',serial:'QA-NOBACKFILL',description:'Equipo QA',publicToken:'f'.repeat(32)}})
  await expectLogo(warrantyLogo,'token',warrantySinBackfill.publicToken,tenant)
  ok((await prisma.warrantyCase.findUnique({where:{id:warrantySinBackfill.id}})).publicTokenHash===null,'GETlogo no ejecuta backfill ni muta garantía')
  await prisma.tenantLogo.update({where:{tenantId_variant:{tenantId:tenant.id,variant:'light'}},data:{mimeType:'text/html'}})
  ok((await publicCall(warrantyLogo,'token',legacy32)).status===404,'MIME fuera dePNG/JPEG/WebP no se entrega como imagen')
  await prisma.tenantLogo.update({where:{tenantId_variant:{tenantId:tenant.id,variant:'light'}},data:{mimeType:'image/png'}})
  await prisma.tenantLogo.deleteMany({where:{tenantId:tenant.id}})
  const sinLogo=await publicCall(transferLogo,'token',transfer.publicToken)
  ok(sinLogo.status===404 && sinLogo.headers.get('Cache-Control')==='no-store','sin imagen devuelve404honesto/no-store')
  ok((await publicCall(getRemito,'token',transfer.publicToken)).status===200,'falta de logo no bloquea documento ni recepción anterior')
  console.log(`Públicas403/503: ${checks} checks OK`)

} finally {
  if (prisma) await prisma.$disconnect()
  if (started) { try { run('pg_ctl', ['-D', pgdata, 'stop', '-w', '-m', 'immediate']) } catch { /* ya detenido */ } }
  rmSync(root, { recursive: true, force: true })
}
