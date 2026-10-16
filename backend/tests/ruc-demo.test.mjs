import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { createHash, webcrypto } from 'node:crypto'
const require = createRequire(import.meta.url)
const ts = require('typescript')
require.extensions['.ts']=(m,p)=>m._compile(ts.transpileModule(readFileSync(p,'utf8'),{compilerOptions:{esModuleInterop:true,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,p)
export function load(path, modules = {}, globals = {}) {
  const exports = {}
  const localRequire = createRequire(new URL(path, import.meta.url))
  const source = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  runInNewContext(source, { exports, process, Date, URL, Request, Response, Headers, AbortSignal, TextDecoder, setTimeout, clearTimeout,
    require: name => Object.hasOwn(modules, name) ? modules[name] : localRequire(name), ...globals })
  return exports
}
export const hashToken = value => createHash('sha256').update(value).digest('hex')
export const auth = load('../lib/auth.ts', { './prisma': { prisma: {} }, bcryptjs: {}, './pin': {}, './google-oauth': {}, './membership': {}, './sucursal-efectiva': {}, './identity': {} })
export const ruc = load('../lib/ruc.ts', { './prisma': { prisma: {} }, './auth': auth,
  './sifen/cdc': load('../lib/sifen/cdc.ts'), './ruc-owndata': load('../lib/ruc-owndata.ts') })
export const publicRuc = load('../lib/ruc-public.ts', { './ruc': ruc, './identity': load('../lib/identity.ts') })
export const http = { json: (body) => Response.json(body), error: (message, status, details) => Response.json({ message, details }, { status }) }
export const routeFor = (reserve, lookup) => load('../app/api/public/ruc/route.ts', {
  '../../../../lib/http': http, '../../../../lib/log': { logError: () => {} }, '../../../../lib/ruc': { ...ruc, lookupRuc: lookup },
  '../../../../lib/ruc-demo-quota': { reserveDemoRucQuota: reserve }, '../../../../lib/ruc-public': publicRuc,
})
export const requestFor = (query = 'ruc=80012345', headers = {}) => new Request(`https://api.example.test/api/public/ruc?${query}`, { headers: { origin: 'https://app.moboss.online', ...headers } })
export const payload = () => ({ data: { ruc: '80012345', dv: '0', fullRuc: '80012345-0', nameOfficial: '  NOMBRE, EXACTO S.A.  ', equivalenceRaw: ' X ', stateRaw: ' ACTIVO ' },
  requestId: 'req_' + 'a'.repeat(24), meta: { environment: 'test', quota: { limit: 100, used: 1, remaining: 99, resetAfter: 300, day: '2026-10-15' }, accounting: { charged: true, alreadyConsulted: false } } })

export async function unit() {
 const saved = { ...process.env }; let checks = 0
 const equal = (a,b) => { assert.deepEqual(a,b); checks++ }
 try {
  process.env.RUC_API_KEY = 'only-test-not-real-key'
  delete process.env.MOBOS_APP_URL
  const quota = load('../lib/ruc-demo-quota.ts', { './prisma': { prisma: {} }, './auth': auth, './ruc': ruc })
  let reserved = 0, fetched = 0, quotaFailure
  const route = routeFor(async () => { reserved++; if (quotaFailure) throw quotaFailure }, input => ruc.lookupRuc(input, { rejectSimulated: true, fetchImpl: async (url, init) => {
    fetched++; assert.equal(url, 'https://app.controlaria.online/api/v1/ruc/80012345'); assert.equal(init.redirect, 'error'); return Response.json(payload())
  } }))
  for (const query of ['', 'ruc=80012345&ruc=80012345', 'ruc=80012345&tenant=x', 'ruc=http://evil.test', 'ruc=80012345-6', 'ruc=80012345%00']) {
   const before = [reserved,fetched]; const res=await route.GET(requestFor(query)); equal(res.status,400); equal(res.headers.get('cache-control'),'private, no-store'); equal([reserved,fetched],before)
  }
  for (const origin of ['', 'null','https://evil.test','https://app.moboss.online.evil.test']) {
   const before=[reserved,fetched];const res=await route.GET(requestFor(undefined,{origin}));equal(res.status,403);equal([reserved,fetched],before);equal(res.headers.get('cache-control'),'private, no-store')
  }
  for (const origin of ['https://app.moboss.online','capacitor://localhost','ionic://localhost']) {
   const res=await route.GET(requestFor(undefined,{origin}));equal(res.status,200);const body=await res.json()
   equal(Object.keys(body).sort(),['query','result','reviewRequired','source']);equal(Object.keys(body.result).sort(),['dv','equivalenceRaw','fullRuc','name','nameOfficial','ruc','stateRaw']);equal(body.result.nameOfficial,'  NOMBRE, EXACTO S.A.  ');equal(body.reviewRequired,true)
   assert.ok(!JSON.stringify(body).includes('accounting')&&!JSON.stringify(body).includes(process.env.RUC_API_KEY));checks++
  }
  quotaFailure = new Error('SECRET-DATABASE-CANARY'); let res=await route.GET(requestFor());equal(res.status,503);assert.ok(!(await res.text()).includes('SECRET'));checks++
  quotaFailure = new ruc.RucLookupError('demo_rate_limited','Límite',429,25);res=await route.GET(requestFor());equal(res.status,429);equal(res.headers.get('Retry-After'),'25');equal(res.headers.get('cache-control'),'private, no-store')
  for (const [envName,max] of [['RUC_DEMO_GLOBAL_DAILY_LIMIT',90],['RUC_DEMO_NETWORK_HOURLY_LIMIT',12]]) {
   for (const value of ['', ' ', '0','-1','1.5','NaN','1e1',String(max+1),'Infinity']) {
    let tx=0;await assert.rejects(()=>quota.reserveDemoRucQuota(requestFor(),{env:{[envName]:value},db:{$transaction:async()=>{tx++}}}),e=>e.code==='demo_quota_not_configured');equal(tx,0)
   }
  }
  delete process.env.MOBOS_TRUST_PROXY
  equal(quota.demoNetworkFingerprint(requestFor(undefined,{'x-forwarded-for':'203.0.113.9'})),quota.demoNetworkFingerprint(requestFor(undefined,{'x-forwarded-for':'203.0.113.10'})))
  process.env.MOBOS_TRUST_PROXY='true'
  equal(quota.demoNetworkFingerprint(requestFor(undefined,{'x-forwarded-for':'2001:db8::1'})),quota.demoNetworkFingerprint(requestFor(undefined,{'x-forwarded-for':'2001:0db8:0:0:0:0:0:1'})))
  equal(quota.demoNetworkFingerprint(requestFor(undefined,{'x-forwarded-for':'192.0.2.1'})),quota.demoNetworkFingerprint(requestFor(undefined,{'x-forwarded-for':'::ffff:c000:201'})))
  equal(quota.demoNetworkFingerprint(requestFor(undefined,{'x-forwarded-for':'6.6.6.6, 203.0.113.9'})),quota.demoNetworkFingerprint(requestFor(undefined,{'x-forwarded-for':'203.0.113.9'})))
  equal(quota.demoNetworkFingerprint(requestFor(undefined,{'x-forwarded-for':'999.999.1.1'})),quota.demoNetworkFingerprint(requestFor(undefined,{})))
  for(const simulated of [{simulado:true},{simulated:true}]) {
   await assert.rejects(()=>ruc.lookupRuc('80012345',{rejectSimulated:true,fetchImpl:async()=>Response.json({...payload(),...simulated})}),e=>e.code==='provider_invalid');checks++
  }
  for(const status of [401,403,404,429,500]) {
   const failing=routeFor(async()=>{},input=>ruc.lookupRuc(input,{rejectSimulated:true,fetchImpl:async()=>new Response('SECRET',{status})}))
   const res=await failing.GET(requestFor());equal(res.status,status===401||status===403||status===500?503:status);equal(res.headers.get('cache-control'),'private, no-store');assert.ok(!(await res.text()).includes('SECRET'));checks++
  }
  for(const body of ['invalid-json','x'.repeat(65537),JSON.stringify(payload()).replace('EXACTO',process.env.RUC_API_KEY)]) {
   const failing=routeFor(async()=>{},input=>ruc.lookupRuc(input,{rejectSimulated:true,fetchImpl:async()=>new Response(body)}));const res=await failing.GET(requestFor());equal(res.status,503);equal(res.headers.get('cache-control'),'private, no-store')
  }
  const missing=routeFor(async()=>{throw Error('quota must not run')},async()=>{throw Error('fetch must not run')});delete process.env.RUC_API_KEY;res=await missing.GET(requestFor());equal(res.status,503);equal((await res.json()).details.code,'provider_not_configured')
  // El límite de tiempo también cubre un cuerpo que nunca termina.
  const timedRuc=load('../lib/ruc.ts',{'./prisma':{prisma:{}},'./auth':auth,'./sifen/cdc':load('../lib/sifen/cdc.ts'),'./ruc-owndata':load('../lib/ruc-owndata.ts')},{AbortSignal:{timeout:()=>AbortSignal.timeout(5)}})
  process.env.RUC_API_KEY='only-test-not-real-key'
  const held=setTimeout(()=>{},1000)
  await assert.rejects(()=>timedRuc.lookupRuc('80012345',{rejectSimulated:true,fetchImpl:async()=>new Response(new ReadableStream({}))}),e=>e.code==='provider_invalid');clearTimeout(held);checks++
  const privateRoute=load('../app/api/ruc/route.ts',{'../../../lib/auth':{requireSession:async()=>null},'../../../lib/http':http,'../../../lib/ruc':ruc,'../../../lib/prisma':{prisma:{}}})
  equal((await privateRoute.GET(new Request('https://api.example.test/api/ruc?ruc=80012345'))).status,401)
  // Middleware real: preflight/final web+iOS, sin credenciales ni query fiscal en logs.
  process.env.RUC_API_KEY='only-test-not-real-key';quotaFailure=undefined
  const {NextRequest}=require('next/server');const logs=[];let forwarded,failProxy=false
  const middleware=load('../middleware.ts',{'next/server':require('next/server'),'./lib/log':{logInfo:(...args)=>logs.push(args),logError:(...args)=>logs.push(args)},'./lib/internal':load('../lib/internal.ts'),'./lib/identity':load('../lib/identity.ts')}, {crypto:webcrypto,fetch:async(url,init)=>{
   if(failProxy)throw Error('synthetic proxy failure')
   forwarded=new Headers(init.headers);return route.GET(new Request(url,{headers:forwarded}))
  }})
  for(const origin of ['https://app.moboss.online','capacitor://localhost','ionic://localhost']){
   for(const method of ['OPTIONS','GET']){
    const response=await middleware.middleware(new NextRequest('https://api.example.test/api/public/ruc?ruc=80012345',{method,headers:{origin,authorization:'Bearer SECRET-AUTH',cookie:'SECRET-COOKIE','x-mobos-client-ip':'192.0.2.2','x-mobos-pass':'forged'}}))
    equal(response.status,method==='OPTIONS'?204:200);equal(response.headers.get('access-control-allow-origin'),origin);equal(response.headers.get('access-control-allow-credentials'),null);equal(response.headers.get('cache-control'),'private, no-store')
    if(method==='GET'){equal(forwarded.get('authorization'),null);equal(forwarded.get('cookie'),null);equal(forwarded.get('x-mobos-cookie'),null)}
   }
  }
  res=await middleware.middleware(new NextRequest('https://api.example.test/api/public/ruc?ruc=80012345',{headers:{origin:'https://evil.test'}}));equal(res.status,403);equal(res.headers.get('access-control-allow-origin'),null);equal(res.headers.get('cache-control'),'private, no-store')
  failProxy=true;res=await middleware.middleware(new NextRequest('https://api.example.test/api/public/ruc?ruc=80012345',{headers:{origin:'capacitor://localhost'}}));equal(res.status,500);equal(res.headers.get('cache-control'),'private, no-store');equal(res.headers.get('access-control-allow-credentials'),null)
  assert.ok(!JSON.stringify(logs).includes('80012345')&&!JSON.stringify(logs).includes('SECRET-AUTH'));checks++
  console.log(`RUC demo public unit: ${checks} PASS`)
 }finally{ for(const key of Object.keys(process.env))if(!(key in saved))delete process.env[key];Object.assign(process.env,saved) }
}
if(process.argv[1]===new URL(import.meta.url).pathname) await unit()
