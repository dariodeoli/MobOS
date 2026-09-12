// Real routes and disposable PostgreSQL only. No .env and no configured DB access.
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
const root = mkdtempSync(join(tmpdir(), 'mobos-promotions-'))
const pgdata = join(root, 'pgdata')
const url = `postgresql://postgres@127.0.0.1:${port}/promotions_test`
const run = (bin, args, input) => execFileSync(join(pgBin, bin), args, { input, stdio: ['pipe','pipe','pipe'] })
let started = false, prisma, checks = 0
try {
  run('initdb', ['-D', pgdata, '--username=postgres', '--auth=trust', '--no-locale', '--encoding=UTF8'])
  run('pg_ctl', ['-D', pgdata, '-l', join(root, 'pg.log'), '-o', `-h 127.0.0.1 -p ${port} -k ${root}`, '-w', 'start']); started = true
  run('createdb', ['-h','127.0.0.1','-p',String(port),'-U','postgres','promotions_test'])
  for (const e of readdirSync(join(backend, 'prisma/migrations'), { withFileTypes: true }).filter(e => e.isDirectory()).sort((a,b) => a.name.localeCompare(b.name))) run('psql', ['-X','-v','ON_ERROR_STOP=1',url], readFileSync(join(backend,'prisma/migrations',e.name,'migration.sql')))
  process.env.DATABASE_URL = url; process.env.NODE_ENV = 'test'
  require.extensions['.ts'] = (m,p) => m._compile(ts.transpileModule(readFileSync(p,'utf8'), { compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,p)
  ;({ prisma } = require('../lib/prisma.ts'))
  const { hashToken } = require('../lib/auth.ts')
  const promos = require('../app/api/promotions/route.ts')
  const quote = require('../app/api/promotions/quote/route.ts').POST
  const order = require('../app/api/orders/route.ts').POST
  for (const tenant of ['a','b']) {
    await prisma.tenant.create({ data: { id:tenant,name:tenant,slug:tenant } })
    await prisma.branch.create({ data: { id:tenant,tenantId:tenant,name:tenant } })
    for (const role of ['ADMIN','VENDEDOR']) {
      const id = `${tenant}-${role}`
      await prisma.user.create({ data: { id,tenantId:tenant,branchId:tenant,name:id,role,pinHash:'unused' } })
      await prisma.session.create({ data: { tenantId:tenant,userId:id,level:'SELLER',deviceId:'test',tokenHash:hashToken(id),expiresAt:new Date(Date.now()+3600000) } })
    }
    await prisma.product.create({ data: { id:tenant,tenantId:tenant,branchId:tenant,sku:tenant,name:tenant,pricePyg:1000,stock:100 } })
  }
  async function req(handler,body,status=200,token='a-ADMIN',method='POST') {
    const res = await handler(new Request('http://localhost/api/promotions', { method,headers:{ Authorization:`Bearer ${token}`, 'x-tenant-id':'b' }, ...(method==='GET'?{}:{body:JSON.stringify(body)}) }))
    const data = await res.json(); assert.equal(res.status,status,JSON.stringify(data)); checks++; return data
  }
  const config = { code:'SAVE10',name:'Ficticio',kind:'PERCENT',value:10,startsAt:new Date(Date.now()-10000).toISOString(),endsAt:new Date(Date.now()+3600000).toISOString(),maxUnits:3 }
  await req(promos.POST,config,401,'missing')
  await req(promos.POST,config,403,'a-VENDEDOR')
  const promo = await req(promos.POST,config,201)
  await req(promos.POST,config,400)
  for (const extra of [{value:101},{value:-1},{value:1.5},{endsAt:config.startsAt},{maxUnits:0},{tenantId:'b'},{usedUnits:0},{productId:'b'}]) await req(promos.POST,{...config,code:'BAD',...extra},extra.productId?404:400)
  assert.equal((await req(promos.GET,undefined,200,'b-VENDEDOR','GET')).length,0)
  assert.equal((await req(promos.GET,undefined,200,'a-VENDEDOR','GET')).length,1)
  const item = {productId:'a',quantity:1,couponCode:'save10',unitPricePyg:900}
  assert.equal((await req(quote,item)).unitPricePyg,900)
  assert.equal((await prisma.promotion.findUnique({where:{id:promo.id}})).usedUnits,0)
  await req(quote,item,409,'b-VENDEDOR')
  await req(quote,{...item,productId:'b'},409)
  let n=0
  const sale = (items=[item],extra={}) => ({orderNumber:`PROMO-${++n}`,items,...extra})
  const before = () => Promise.all([prisma.product.findUnique({where:{id:'a'}}),prisma.promotion.findUnique({where:{id:promo.id}}),prisma.order.count(),prisma.customer.count()])
  for (const payload of [sale([{...item,unitPricePyg:1}],{customer:{name:'Rollback'}}),sale([item],{payments:[{method:'CASH',amountPyg:901}]}),sale([{...item,quantity:4}])]) {
    const snapshot=await before(); await req(order,payload,409,'a-VENDEDOR'); assert.deepEqual(await before(),snapshot)
  }
  await req(order,sale([item],{discountPyg:1}),400)
  await req(promos.PATCH,{id:promo.id,isActive:false},403,'a-VENDEDOR','PATCH')
  await req(promos.PATCH,{id:promo.id,isActive:false},404,'b-ADMIN','PATCH')
  await req(promos.PATCH,{id:promo.id,isActive:false},200,'a-ADMIN','PATCH')
  await req(quote,item,409)
  await req(promos.PATCH,{id:promo.id,isActive:true},200,'a-ADMIN','PATCH')
  const first=await req(order,sale(),201,'a-VENDEDOR')
  assert.equal(first.totalPyg,900); assert.equal(first.items[0].promotionSnapshot.baseUnitPricePyg,1000)
  const results=await Promise.all([1,2].map(() => order(new Request('http://localhost/api/orders',{method:'POST',headers:{Authorization:'Bearer a-VENDEDOR'},body:JSON.stringify(sale([{...item,quantity:2}]))}))))
  assert.deepEqual(results.map(r=>r.status).sort(),[201,409]); checks++
  assert.equal((await prisma.promotion.findUnique({where:{id:promo.id}})).usedUnits,3)
  await req(quote,item,409)
  for (const [code, extra] of [['EXPIRED',{startsAt:'2020-01-01',endsAt:'2021-01-01'}],['FUTURE',{startsAt:'2090-01-01',endsAt:'2091-01-01'}]]) {
    await req(promos.POST,{...config,code,...extra},201); await req(quote,{...item,couponCode:code},409)
  }
  await req(promos.POST,{...config,code:'FIXED',kind:'FIXED',value:2000,maxUnits:null,productId:'a'},201)
  assert.equal((await req(quote,{...item,couponCode:'FIXED'})).unitPricePyg,0)
  await prisma.branch.create({data:{id:'a2',tenantId:'a',name:'Other'}})
  await prisma.product.create({data:{id:'cross',tenantId:'a',branchId:'a2',sku:'cross',name:'Other',pricePyg:1000,stock:10}})
  await req(quote,{...item,productId:'cross',couponCode:'FIXED'},409)
  console.log(`Promotions: ${checks} route checks OK; PostgreSQL migrations, permissions, tenant/branch isolation, snapshots, rollback and concurrent redemption.`)
} finally {
  if(prisma) await prisma.$disconnect()
  if(started) run('pg_ctl',['-D',pgdata,'-m','fast','-w','stop'])
  rmSync(root,{recursive:true,force:true})
}
