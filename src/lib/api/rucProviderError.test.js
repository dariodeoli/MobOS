import assert from 'node:assert/strict'
import test from 'node:test'
import { isOwnDataCredentialError, readRucErrorBody } from './rucProviderError.js'

test('only exact authenticated RUC GET and safe provider code bypass private invalidation', () => {
  const payload = { details: { code: 'API_KEY_EXPIRED', provider: 'OwnData' } }
  assert.equal(isOwnDataCredentialError('/api/ruc?ruc=80012345', 'GET', 401, payload), true)
  for (const path of ['/api/auth/me','/api/public/ruc','/api/ruc/','https://evil.invalid/api/ruc','/api/ruc-other']) assert.equal(isOwnDataCredentialError(path,'GET',401,payload),false)
  for (const bad of [null,{}, {details:{code:'API_KEY_EXPIRED'}},{details:{code:'UNAUTHORIZED',provider:'OwnData'}},{details:{code:'SESSION_EXPIRED',provider:'OwnData'}}]) assert.equal(isOwnDataCredentialError('/api/ruc','GET',401,bad),false)
  assert.equal(isOwnDataCredentialError('/api/ruc','POST',401,payload),false)
  assert.equal(isOwnDataCredentialError('/api/ruc','GET',403,payload),false)
  assert.equal(isOwnDataCredentialError('/api/ruc','GET',403,{details:{code:'PLAN_REQUIRED',provider:'OwnData'}}),true)
})
test('RUC credential-body admission is bounded and malformed JSON fails closed',async()=>{
  const payload={details:{code:'API_KEY_INVALID',provider:'OwnData'}}
  assert.deepEqual(await readRucErrorBody(Response.json(payload)),payload)
  await assert.rejects(()=>readRucErrorBody(new Response('x'.repeat(65537),{headers:{'Content-Type':'application/json'}})))
  await assert.rejects(()=>readRucErrorBody(new Response('{',{headers:{'Content-Type':'application/json'}})))
  assert.equal(await readRucErrorBody(new Response('401')),null)
})

test('real client keeps snapshots for provider401 but invalidates its own401 and malformed denial',async()=>{
  const {readFileSync}=await import('node:fs')
  const {runInNewContext}=await import('node:vm')
  const source=readFileSync(new URL('./client.js',import.meta.url),'utf8')
    .replace(/^import .*\n/gm,'').replaceAll('import.meta.env','env').replace(/export (const|function|async function)/g,'$1').replace('export { API_URL }','')+'\nthis.clientApi=api;'
  for(const [path,payload,expected] of [
    ['/api/ruc?ruc=80012345',{details:{code:'API_KEY_EXPIRED',provider:'OwnData'}},0],
    ['/api/ruc?ruc=80012345',{message:'Sesión inválida.'},1],
    ['/api/auth/me',{details:{code:'API_KEY_EXPIRED',provider:'OwnData'}},1],
    ['/api/ruc?ruc=80012345',null,1],
  ]){
    let invalidations=0
    const scope={env:{VITE_API_URL:'https://api.example.invalid'},ApiError:class extends Error{},CACHE_GET_MS:0,
      cacheDeConsultas:{invalidarTodo(){},guardar(){},leer(){}},isDemoRuntime:false,guardarTokens(){},opcionesDeSesion:()=>({headers:{},credentials:'include'}),isNativeIOS:()=>false,
      generacionSnapshots:()=>1,invalidarSnapshotsPrivados:async()=>{invalidations++},esDenegacionPrivada:()=>false,
      isOwnDataCredentialError,readRucErrorBody,fetch:async()=>payload===null?new Response('{',{status:401,headers:{'Content-Type':'application/json'}}):Response.json(payload,{status:401}),
      AbortController,setTimeout,clearTimeout,FormData,Response}
    runInNewContext(source,scope)
    await assert.rejects(()=>scope.clientApi.get(path,{cacheMs:0}))
    assert.equal(invalidations,expected,path)
  }
})
