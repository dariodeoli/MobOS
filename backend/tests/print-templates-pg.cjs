// Real HTTP + route handlers + real Prisma/Postgres. No production defaults.
const assert = require('node:assert/strict'), fs = require('node:fs'), http = require('node:http'), ts = require('typescript')
const target = new URL(process.env.DATABASE_URL || 'http://invalid')
if (target.hostname !== '127.0.0.1' || target.port !== '5579' || target.pathname !== '/mobos507') throw Error('Dedicated DATABASE_URL 127.0.0.1:5579/mobos507 required')
process.env.NODE_ENV = 'test'
require.extensions['.ts'] = (m,p) => m._compile(ts.transpileModule(fs.readFileSync(p,'utf8'), { compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,p)
const { prisma } = require('../lib/prisma.ts'), { createSession } = require('../lib/auth.ts')
const root = require('../app/api/print/templates/route.ts'), detail = require('../app/api/print/templates/[id]/route.ts'), defaults = require('../app/api/print/templates/defaults/route.ts')
const presets = require('./fixtures/print-templates-507.json')
let checks = 0, server
const eq = (a,b,label) => { assert.deepEqual(a,b,label); checks++ }
async function main() {
  const prefix = `qa507-${Date.now()}`
  const tenant = await prisma.tenant.create({data:{name:'Ficticia A',slug:prefix+'a'}})
  const other = await prisma.tenant.create({data:{name:'Ficticia B',slug:prefix+'b'}})
  const a1 = await prisma.branch.create({data:{tenantId:tenant.id,name:'A1'}}), a2 = await prisma.branch.create({data:{tenantId:tenant.id,name:'A2'}}), b1 = await prisma.branch.create({data:{tenantId:other.id,name:'B1'}})
  async function token(t,role,branchId=null) { const user = await prisma.user.create({data:{tenantId:t.id,name:'QA',pinHash:'unused',role,branchId}}); return (await createSession(prisma,t.id,user.id,'SELLER',prefix,branchId)).accessToken }
  const admin = await token(tenant,'ADMIN'), foreign = await token(other,'ADMIN'), seller = await token(tenant,'VENDEDOR',a1.id), branchAdmin = await token(tenant,'ADMIN',a1.id)
  server = http.createServer(async (req,res) => {
    try {
      const chunks=[];for await(const chunk of req) chunks.push(chunk)
      const url = new URL(req.url,'http://127.0.0.1:3197'), id = url.pathname.split('/')[4]
      const route = id === 'defaults' ? defaults : id ? detail : root
      const request = new Request(url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})})
      const response = route[req.method] ? await route[req.method](request,{params:Promise.resolve({id})}) : new Response('',{status:405})
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()))
    } catch(e) { console.error(e);res.writeHead(500);res.end('{}') }
  })
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(3197,'127.0.0.1',resolve)})
  async function call(method,path='',body,auth=admin) { const res=await fetch('http://127.0.0.1:3197/api/print/templates'+path,{method,headers:{...(auth?{Authorization:'Bearer '+auth}:{}),'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:res.status,data:await res.json()} }
  try {
    eq((await call('GET','',undefined,null)).status,401,'no session')
    eq((await call('POST','',presets[1],seller)).status,403,'read only seller')
    const created = await call('POST','',presets[1]); eq(created.status,201,'create persists');const t=created.data
    eq(t.revision,1);eq(t.definition,presets[1].definition)
    eq((await call('GET','/'+t.id,undefined,foreign)).status,404,'tenant isolation')
    eq((await call('PATCH','/'+t.id,{revision:1,name:'Foreign'},foreign)).status,404)
    eq((await call('GET','',undefined,foreign)).data.templates.length,0)
    eq((await call('GET','',undefined,seller)).data.templates.length,1)
    const updated = await call('PATCH','/'+t.id,{revision:1,name:'Nueva etiqueta'});eq(updated.status,200);eq(updated.data.revision,2)
    eq((await call('PATCH','/'+t.id,{revision:1,name:'Vieja'})).status,409,'revision stale')
    const race = await Promise.all([call('PATCH','/'+t.id,{revision:2,name:'Carrera uno'}),call('PATCH','/'+t.id,{revision:2,name:'Carrera dos'})]);eq(race.map(r=>r.status).sort(),[200,409],'concurrent edit one winner')
    const live = (await call('GET','/'+t.id)).data
    const duplicate = await call('POST','/'+t.id,{action:'duplicate',revision:live.revision,name:'Duplicada'});eq(duplicate.status,201);eq(duplicate.data.definition,t.definition);eq(duplicate.data.revision,1)
    const u=duplicate.data
    eq((await call('PUT','/defaults',{kind:t.kind,branchId:null,templateId:t.id})).status,200)
    eq((await call('GET','/defaults?kind='+t.kind+'&branchId='+a1.id)).data.effective[t.kind],{templateId:t.id,source:'company'})
    eq((await call('PUT','/defaults',{kind:t.kind,branchId:a1.id,templateId:u.id})).status,200)
    eq((await call('GET','/defaults?branchId='+a1.id)).data.effective[t.kind],{templateId:u.id,source:'branch'})
    eq((await call('GET','/defaults?branchId='+a2.id)).data.effective[t.kind],{templateId:t.id,source:'company'})
    eq((await call('PUT','/defaults',{kind:t.kind,branchId:b1.id,templateId:u.id})).status,404,'foreign branch')
    eq((await call('PUT','/defaults',{kind:t.kind,branchId:a2.id,templateId:u.id},branchAdmin)).status,403,'branch admin restricted')
    eq((await call('GET','/defaults?branchId='+a2.id,undefined,seller)).status,403,'branch read restricted')
    eq((await call('GET','/defaults?branchId=',undefined,seller)).status,403,'branch session cannot escape to company')
    eq((await call('PUT','/defaults',{kind:t.kind,branchId:null,templateId:u.id},foreign)).status,404,'foreign template default')
    eq((await call('PUT','/defaults',{kind:t.kind,branchId:'',templateId:u.id})).status,400,'empty branch is not company')
    eq((await call('PUT','/defaults',{kind:t.kind,branchId:a1.id,templateId:u.id},seller)).status,403,'seller cannot change defaults')
    eq((await call('PUT','/defaults',{kind:'comprobante',branchId:null,templateId:u.id})).status,404,'kind mismatch')
    const defaultsRace=await Promise.all([call('PUT','/defaults',{kind:t.kind,branchId:null,templateId:t.id}),call('PUT','/defaults',{kind:t.kind,branchId:null,templateId:u.id})]);eq(defaultsRace.map(r=>r.status),[200,200]);eq(await prisma.printTemplateDefault.count({where:{tenantId:tenant.id,scopeKey:'company',kind:t.kind}}),1,'one company default after race')
    eq((await call('PUT','/defaults',{kind:t.kind,branchId:a1.id,templateId:null})).status,200)
    eq((await call('GET','/defaults?branchId='+a1.id)).data.effective[t.kind].source,'company')
    const custom = structuredClone(t.definition);custom.elements[0].fontSizePt=9;custom.elements[1].visible=false
    const changed=await call('PATCH','/'+t.id,{revision:live.revision,definition:custom});eq(changed.status,200);eq((await call('GET','/'+t.id)).data.definition,custom,'custom geometry survives read')
    const reset=await call('POST','/'+t.id,{action:'restore',revision:changed.data.revision});eq(reset.status,200);eq(reset.data.definition,presets[1].definition);eq(reset.data.name,live.name)
    eq((await call('DELETE','/'+t.id,{revision:live.revision})).status,409)
    eq((await call('DELETE','/'+u.id,{revision:1})).status,200)
    eq((await call('GET','/'+u.id)).status,404)
    eq(await prisma.printTemplateDefault.count({where:{templateId:u.id}}),0,'archiving removes stale defaults')
    eq((await call('PUT','/defaults',{kind:t.kind,branchId:null,templateId:u.id})).status,404,'archived template rejected')
    const before=await prisma.printTemplate.count({where:{tenantId:tenant.id}})
    const receipt = await call('POST','',presets[0]);eq(receipt.status,201)
    const noTotal=structuredClone(presets[0]);noTotal.definition.elements=noTotal.definition.elements.filter(e=>e.binding!=='total');eq((await call('POST','',noTotal)).status,400,'receipt cannot omit total')
    const bad=structuredClone(presets[1]);bad.definition.elements[0].html='<script>secret</script>'
    eq((await call('POST','',bad)).status,400)
    eq((await call('POST','',{...presets[1],tenantId:other.id})).status,400)
    eq((await call('POST','',{...presets[1],name:'A'.repeat(66000)})).status,413)
    eq(await prisma.printTemplate.count({where:{tenantId:tenant.id}}),before+1,'invalid writes rolled back; only valid receipt added')
    const logs=await prisma.auditLog.findMany({where:{tenantId:tenant.id,action:{startsWith:'PRINT_TEMPLATE'}}})
    eq(logs.length>8,true,'configuration audited');eq(logs.every(l=>l.userId && l.createdAt),true,'actor timestamp')
    eq(logs.some(l=>JSON.stringify(l.metadata).includes('Nueva etiqueta')),false,'no names/business values in audit')
    const fallback=await call('PUT','/defaults',{kind:t.kind,branchId:null,templateId:null});eq(fallback.status,200)
    eq((await call('GET','/defaults?kind='+t.kind)).data.effective[t.kind],{templateId:null,source:'builtin'})
    console.log(`print-templates PG/HTTP: ${checks} checks PASS`)
  } finally {
    await new Promise(resolve=>server.close(resolve));await prisma.tenant.deleteMany({where:{id:{in:[tenant.id,other.id]}}})
  }
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>prisma.$disconnect())
