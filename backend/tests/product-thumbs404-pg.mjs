// #404: HTTP local + Prisma/PG descartable; nunca hereda un target real.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { createServer as portProbe } from 'node:net'
import { mkdtempSync, readFileSync, readdirSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
const require=createRequire(import.meta.url), backend=dirname(dirname(fileURLToPath(import.meta.url)))
const ts=require('typescript'), pgBin=process.env.PG_BIN||'/opt/homebrew/bin'
const root=mkdtempSync(join(tmpdir(),'mobos-thumbs404-')), pgdata=join(root,'pgdata'), storage=join(root,'attachments')
const port=5588, apiPort=3206, dbUrl=`postgresql://postgres@127.0.0.1:${port}/thumbs404_test`
const run=(bin,args,input)=>execFileSync(join(pgBin,bin),args,{input,stdio:['pipe','pipe','pipe']})
let started=false,prisma,server,checks=0
const eq=(a,b,label)=>{assert.deepEqual(a,b,label);checks++},ok=(a,label)=>{assert.ok(a,label);checks++}
try {
 await new Promise((resolve,reject)=>{const probe=portProbe();probe.once('error',reject);probe.listen(port,'127.0.0.1',()=>probe.close(resolve))})
 run('initdb',['-D',pgdata,'--username=postgres','--auth=trust','--no-locale','--encoding=UTF8'])
 run('pg_ctl',['-D',pgdata,'-l',join(root,'pg.log'),'-o',`-h 127.0.0.1 -p ${port} -k ${root}`,'-w','start']);started=true
 run('createdb',['-h','127.0.0.1','-p',String(port),'-U','postgres','thumbs404_test'])
 for(const entry of readdirSync(join(backend,'prisma/migrations'),{withFileTypes:true}).filter(e=>e.isDirectory()).sort((a,b)=>a.name.localeCompare(b.name)))run('psql',['-X','-v','ON_ERROR_STOP=1',dbUrl],readFileSync(join(backend,'prisma/migrations',entry.name,'migration.sql')))
 Object.assign(process.env,{DATABASE_URL:dbUrl,NODE_ENV:'test',MOBOS_STORAGE_DIR:storage,MOBOS_AUTH_SECRET:'cd'.repeat(32),MOBOS_APP_URL:'http://127.0.0.1:3206'})
 require.extensions['.ts']=(m,p)=>m._compile(ts.transpileModule(readFileSync(p,'utf8'),{compilerOptions:{esModuleInterop:true,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,p)
 ;({prisma}=require('../lib/prisma.ts'))
 const {createSession}=require('../lib/auth.ts'), collection=require('../app/api/products/[id]/images/route.ts'),detail=require('../app/api/products/[id]/images/[imageId]/route.ts')
 const tenant=await prisma.tenant.create({data:{name:'Ficticia A',slug:'thumbs404-a'}}),other=await prisma.tenant.create({data:{name:'Ficticia B',slug:'thumbs404-b'}})
 const branch=await prisma.branch.create({data:{tenantId:tenant.id,name:'A1'}}),secondBranch=await prisma.branch.create({data:{tenantId:tenant.id,name:'A2'}}),foreignBranch=await prisma.branch.create({data:{tenantId:other.id,name:'B1'}})
 async function session(t,role,branchId){const u=await prisma.user.create({data:{tenantId:t.id,name:'QA ficticio',pinHash:'unused',role,branchId}});return (await createSession(prisma,t.id,u.id,'SELLER','qa404',branchId)).accessToken}
 const admin=await session(tenant,'ADMIN',branch.id),seller=await session(tenant,'VENDEDOR',branch.id),foreign=await session(other,'ADMIN',foreignBranch.id)
 const product=await prisma.product.create({data:{tenantId:tenant.id,branchId:branch.id,sku:'THUMB404',name:'Producto ficticio',pricePyg:1234567}})
 const productOtherBranch=await prisma.product.create({data:{tenantId:tenant.id,branchId:secondBranch.id,sku:'THUMB404-BRANCH',name:'Otro depósito',pricePyg:2}})
 server=createServer(async(req,res)=>{try{const chunks=[];for await(const c of req)chunks.push(c);const url=new URL(req.url,`http://127.0.0.1:${apiPort}`),parts=url.pathname.split('/'),id=parts[3],imageId=parts[5],route=imageId?detail:collection;const response=await route[req.method](new Request(url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})}),{params:Promise.resolve({id,imageId})});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()))}catch(e){console.error(e);res.writeHead(500);res.end('{}')}})
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(apiPort,'127.0.0.1',resolve)})
 const base=`http://127.0.0.1:${apiPort}/api/products/`
 const call=(path='',token=admin,options={})=>fetch(base+product.id+'/images'+path,{...options,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(options.headers||{})}})
 const upload=(bytes,type='image/png',token=admin,extra={},pid=product.id)=>{const form=new FormData();form.append('file',new Blob([bytes],{type}),'arbitrary.exe');for(const[k,v]of Object.entries(extra))form.append(k,v);return fetch(base+pid+'/images',{method:'POST',headers:token?{Authorization:'Bearer '+token}:{},body:form})}
 const source=await sharp({create:{width:1200,height:600,channels:3,background:'#dc3456'}}).png().toBuffer()
 const green=await sharp({create:{width:160,height:160,channels:3,background:'#12bc34'}}).webp().toBuffer()
 eq((await upload(source,'image/png',null)).status,401,'anonymous upload denied')
 eq((await upload(source,'image/png',seller)).status,403,'seller cannot manage')
 eq((await upload(source,'image/png',foreign)).status,404,'foreign tenant cannot upload')
 eq((await upload(source,'image/png',admin,{},productOtherBranch.id)).status,403,'foreign branch cannot upload')
 for(const [bytes,mime,status]of [[source,'image/jpeg',415],[source.subarray(0,33),'image/png',400],[Buffer.alloc(5*1024*1024+1),'image/png',413]])eq((await upload(bytes,mime)).status,status,'invalid input rejected')
 eq(await prisma.productImage.count(),0,'rejections persist no rows')
 let response=await upload(source,'image/png',admin,{thumb:new Blob([green],{type:'image/webp'}),variantKey:'azul',width:'1',height:'1'})
 eq(response.status,201,'upload with unrelated client thumbnail succeeds using server derivative')
 const image=await response.json();eq([image.width,image.height,image.contentType,image.variantKey],[800,800,'image/webp','azul'],'dimensions/type authoritative; variant unchanged')
 ok(!('data'in image)&&!('storagePath'in image)&&!('thumbPath'in image),'DTO excludes bytes/storage paths')
 const stored=await prisma.productImage.findUnique({where:{id:image.id}})
 eq([stored.data,stored.thumbData],[null,null],'volume stores bytes, not originals in DB')
 ok(stored.storagePath.startsWith(tenant.id+'/product-images/')&&stored.thumbPath.startsWith(tenant.id+'/product-images/'),'both files tenant-scoped')
 eq(readdirSync(join(storage,tenant.id,'product-images')).length,2,'only two derivatives stored')
 for(const [query,size]of [['',800],['?size=thumb',160]]){
  const res=await call('/'+image.id+query);eq(res.status,200);eq(res.headers.get('content-type'),'image/webp');eq(res.headers.get('x-content-type-options'),'nosniff')
  const bytes=Buffer.from(await res.arrayBuffer()),meta=await sharp(bytes).metadata();eq([meta.width,meta.height,meta.format],[size,size,'webp']);eq(meta.exif,undefined);ok(!bytes.equals(source)&&!bytes.equals(green),'no original/client pixels served')
  const pixel=await sharp(bytes).resize(1,1).raw().toBuffer();ok(pixel[0]>150&&pixel[1]<100,'red source, not unrelated green client thumbnail')
  const etag=res.headers.get('etag');eq((await call('/'+image.id+query,admin,{headers:{'If-None-Match':etag}})).status,304,'stable private ETag')
  eq((await call('/'+image.id+query,foreign)).status,404,'cross-tenant bytes denied even thumbnail')
  eq((await call('/'+image.id+query,null)).status,401,'anonymous bytes denied')
 }
 const audit=await prisma.auditLog.findFirst({where:{entityId:product.id,action:'PRODUCT_IMAGE_ADDED'}})
 eq(audit.metadata.sha256,createHash('sha256').update(readFileSync(join(storage,stored.storagePath))).digest('hex'),'audit hashes actual derivative')
 eq((await call('',seller)).status,200,'seller still reads gallery')
 eq((await call('',foreign)).status,404,'other tenant cannot enumerate')
 // Sin volumen: ambos derivados quedan en ByteA; no se exige thumb cliente.
 process.env.MOBOS_STORAGE_DIR=''
 response=await upload(source);eq(response.status,201);const inline=await response.json(),inlineRow=await prisma.productImage.findUnique({where:{id:inline.id}})
 eq([inlineRow.storagePath,inlineRow.thumbPath],[null,null]);ok(inlineRow.data?.length&&inlineRow.thumbData?.length,'both derivatives retained in DB fallback')
 eq((await sharp(inlineRow.thumbData).metadata()).width,160)
 // Registro histórico deliberado: sigue intacto y GETthumb mantiene fallback.
 const legacy=await prisma.productImage.create({data:{tenantId:tenant.id,productId:product.id,position:2,isPrimary:false,data:source,width:1200,height:600,contentType:'image/png',sizeBytes:source.length}})
 response=await call('/'+legacy.id+'?size=thumb');eq(response.headers.get('content-type'),'image/png');ok(Buffer.from(await response.arrayBuffer()).equals(source),'legacy original unchanged; no automatic backfill')
 const legacyAfter=await prisma.productImage.findUnique({where:{id:legacy.id}});eq([legacyAfter.width,legacyAfter.height,legacyAfter.thumbData],[1200,600,null])
 process.env.MOBOS_STORAGE_DIR=storage
 eq((await call('/'+image.id,seller,{method:'DELETE'})).status,403)
 eq((await call('/'+image.id,foreign,{method:'DELETE'})).status,404)
 eq((await call('/'+image.id,admin,{method:'DELETE'})).status,200,'delete hides')
 eq((await call('/'+image.id)).status,404);eq((await call('/'+image.id+'?size=thumb')).status,404)
 ok(existsSync(join(storage,stored.storagePath))&&existsSync(join(storage,stored.thumbPath)),'logical delete preserves historical bytes')
 eq((await prisma.productImage.findUnique({where:{id:image.id}})).deletedAt!==null,true)
 console.log(`product-thumbs404: ${checks} HTTP/PG checks PASS`)
}finally{
 if(server)await new Promise(resolve=>server.close(resolve))
 if(prisma)await prisma.$disconnect()
 if(started)run('pg_ctl',['-D',pgdata,'-m','immediate','-w','stop'])
 rmSync(root,{recursive:true,force:true})
}
