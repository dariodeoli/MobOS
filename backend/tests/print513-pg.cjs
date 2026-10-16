// Isolated HTTP/real Prisma route checks, fictitious tenants only.
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),ts=require('typescript')
const url=new URL(process.env.DATABASE_URL||'http://invalid')
if(url.hostname!=='127.0.0.1'||!['/mobos513','/mobos_it'].includes(url.pathname)||(url.pathname==='/mobos_it'&&process.env.MOBOS_IT_EXECUTE!=='1'))throw Error('Dedicated loopback QA database mobos513 or opt-in isolated mobos_it required')
process.env.NODE_ENV='test'
require.extensions['.ts']=(m,p)=>m._compile(ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{esModuleInterop:true,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,p)
const {prisma}=require('../lib/prisma.ts'),{createSession}=require('../lib/auth.ts'),route=require('../app/api/print/jobs/route.ts')
const {PAYLOAD_MAX_B64,MAX_BYTES_ABIERTOS_POR_EMPRESA,PRINT_BODY_MAX_BYTES}=require('../lib/print-jobs.ts')
let checks=0,server,port=0,tenants=[]
function eq(a,b,label){assert.deepEqual(a,b,label);checks++}
async function main(){
 const prefix='qa513-'+Date.now()
 const a=await prisma.tenant.create({data:{name:'Ficticia A',slug:prefix+'a'}}),b=await prisma.tenant.create({data:{name:'Ficticia B',slug:prefix+'b'}});tenants=[a.id,b.id]
 const ba=await prisma.branch.create({data:{tenantId:a.id,name:'A'}}),bb=await prisma.branch.create({data:{tenantId:b.id,name:'B'}})
 async function auth(t){const u=await prisma.user.create({data:{tenantId:t.id,name:'QA sintético',role:'ADMIN',pinHash:'unused'}});return(await createSession(prisma,t.id,u.id,'SELLER',prefix)).accessToken}
 const ta=await auth(a),tb=await auth(b)
 const foreign=await prisma.printPrinter.create({data:{tenantId:b.id,name:'Ficticia B',destination:'lan:192.0.2.99:9100'}})
 server=http.createServer(async(req,res)=>{try{const request=new Request('http://127.0.0.1:'+port+req.url,{method:req.method,headers:req.headers,...(req.method==='POST'?{body:req,duplex:'half'}:{})});const response=await route[req.method](request);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()))}catch(e){console.error(e);res.writeHead(500);res.end('{}')}})
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)})
 port=server.address().port
 async function call(body,token=ta,method='POST'){const r=await fetch('http://127.0.0.1:'+port+'/api/print/jobs',{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json'},...(method==='POST'?{body:typeof body==='string'?body:JSON.stringify(body)}:{})});return{status:r.status,data:await r.json()}}
 const base={path:'REMOTO',destination:'lan:192.0.2.99:9100',kind:'comprobante',reference:'QA-513',payload:'AAAA'}
 try{
  eq((await call(base,null)).status,401,'no auth')
  eq((await call({...base,printerId:foreign.id})).status,404,'foreign printer')
  eq((await call({...base,branchId:bb.id})).status,404,'foreign branch')
  const actual=Buffer.from((process.env.MOBOS_PRINT_RASTER_FIXTURE?fs.readFileSync(process.env.MOBOS_PRINT_RASTER_FIXTURE):Buffer.concat([Buffer.from([27,64,27,116,2,27,97,0]),...Array.from({length:6},()=>Buffer.concat([Buffer.from([27,97,1,29,118,48,0,72,0,0,1]),Buffer.alloc(72*256)])),Buffer.from([27,100,2,29,86,0])]))).toString('base64')
  assert.ok(actual.length>131072&&actual.length<=PAYLOAD_MAX_B64);checks++
  const receipt=await call({...base,payload:actual,rasterVersion:1,branchId:ba.id,copies:2,idempotencyKey:'fixture-receipt'})
  eq(receipt.status,201,'real raster accepted over old cap');eq(receipt.data.job.payloadBytes,Buffer.from(actual,'base64').length,'actual bytes');eq(receipt.data.job.copies,2);eq(receipt.data.job.payload,undefined,'no payload in public DTO')
  const malformed=Buffer.from(actual,'base64');malformed[malformed.length-1]=255
  eq((await call({...base,payload:malformed.toString('base64'),rasterVersion:1})).status,400,'raster suffix rejected')
  eq((await call({...base,payload:actual,rasterVersion:2})).status,400,'raster version closed')
  eq((await call({...base,payload:actual,idempotencyKey:'fixture-receipt'})).data.job.id,receipt.data.job.id,'idempotence')
  const foreignList=await call(undefined,tb,'GET');eq(foreignList.status,200);assert.ok(!JSON.stringify(foreignList.data).includes(receipt.data.job.id));checks++
  for(const payload of ['A','AA=','A===','AAAA=AAA','AB=='])eq((await call({...base,payload})).status,400,'malformed base64')
  eq((await call({...base,payload:'A'.repeat(PAYLOAD_MAX_B64+4)})).status,413,'above payload cap')
  eq((await call('x'.repeat(PRINT_BODY_MAX_BYTES+1))).status,413,'stream body cap')
  const exact=await call({...base,reference:'EXACT',payload:'A'.repeat(PAYLOAD_MAX_B64)});eq(exact.status,201);eq(exact.data.job.payloadBytes,393216,'exact raw bytes')
  await prisma.printJob.deleteMany({where:{tenantId:a.id}})
  // Aggregate quota fixture reserves space without allocating 20MiB in test.
  await prisma.printJob.create({data:{tenantId:a.id,destination:base.destination,kind:'quota-fixture',payloadBytes:MAX_BYTES_ABIERTOS_POR_EMPRESA-393216,state:'PENDIENTE'}})
  const race=await Promise.all([call({...base,reference:'RACE1',payload:'A'.repeat(PAYLOAD_MAX_B64)}),call({...base,reference:'RACE2',payload:'A'.repeat(PAYLOAD_MAX_B64)})])
  eq(race.map(r=>r.status).sort(),[201,429],'aggregate cap atomic')
  const quota=await prisma.printJob.aggregate({where:{tenantId:a.id,state:{in:['PENDIENTE','RECLAMADO']}},_sum:{payloadBytes:true}});eq(quota._sum.payloadBytes,MAX_BYTES_ABIERTOS_POR_EMPRESA)
  eq((await call({...base,reference:'B-ISOLATED'},tb)).status,201,'other tenant unaffected')
  await prisma.printJob.deleteMany({where:{tenantId:a.id}})
  await prisma.printJob.createMany({data:Array.from({length:200},(_,i)=>({tenantId:a.id,destination:base.destination,kind:'count-fixture',reference:String(i)}))})
  eq((await call({...base,reference:'COUNT201'})).status,429,'count cap preserved')
  console.log('print513 HTTP/PG PASS',checks)
 }finally{await new Promise(resolve=>server.close(resolve));await prisma.tenant.deleteMany({where:{id:{in:tenants}}});await prisma.$disconnect()}
}
main().catch(e=>{console.error(e);process.exitCode=1;server?.close();prisma.$disconnect()})
