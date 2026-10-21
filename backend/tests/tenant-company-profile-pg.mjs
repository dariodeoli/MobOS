// #608: tenant company profile service against disposable PostgreSQL only.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const require=createRequire(import.meta.url), backend=dirname(dirname(fileURLToPath(import.meta.url))), ts=require('typescript'), pgBin=process.env.PG_BIN||'/opt/homebrew/bin'
const root=mkdtempSync(join(tmpdir(),'mobos-company-profile-')), pgdata=join(root,'pgdata'), port=5594, dbUrl=`postgresql://postgres@127.0.0.1:${port}/company_profile_test`
const run=(bin,args,input)=>execFileSync(join(pgBin,bin),args,{input,stdio:['pipe','pipe','pipe']})
let started=false,prisma,checks=0
const eq=(a,b,label)=>{assert.deepEqual(a,b,label);checks++}, ok=(v,label)=>{assert.ok(v,label);checks++}
try {
 run('initdb',['-D',pgdata,'--username=postgres','--auth=trust','--no-locale','--encoding=UTF8'])
 run('pg_ctl',['-D',pgdata,'-l',join(root,'pg.log'),'-o',`-h 127.0.0.1 -p ${port} -k ${root}`,'-w','start']); started=true
 run('createdb',['-h','127.0.0.1','-p',String(port),'-U','postgres','company_profile_test'])
 for(const entry of readdirSync(join(backend,'prisma/migrations'),{withFileTypes:true}).filter(e=>e.isDirectory()).sort((a,b)=>a.name.localeCompare(b.name))) run('psql',['-X','-v','ON_ERROR_STOP=1',dbUrl],readFileSync(join(backend,'prisma/migrations',entry.name,'migration.sql')))
 process.env.DATABASE_URL=dbUrl; process.env.NODE_ENV='test'; process.env.MOBOS_AUTH_SECRET='c8'.repeat(32)
 require.extensions['.ts']=(m,p)=>m._compile(ts.transpileModule(readFileSync(p,'utf8'),{compilerOptions:{esModuleInterop:true,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,p)
 ;({prisma}=require('../lib/prisma.ts'))
 const {readTenantCompanyProfile,updateTenantCompanyProfile,CompanyReauthenticationRequiredError}=require('../lib/tenant-company-profile.ts')
 const tenant=await prisma.tenant.create({data:{name:'Empresa QA',slug:'company-profile-a',email:'qa-a@example.com',emailVerifiedAt:new Date()}})
 const foreignTenant=await prisma.tenant.create({data:{name:'Empresa ajena',slug:'company-profile-b',email:'qa-b@example.com'}})
 const account=await prisma.account.create({data:{email:'owner@example.com'}})
 const admin=await prisma.user.create({data:{tenantId:tenant.id,name:'Admin QA',pinHash:'unused',role:'ADMIN'}})
 const seller=await prisma.user.create({data:{tenantId:tenant.id,name:'Vendedor QA',pinHash:'unused',role:'VENDEDOR'}})
 const foreignAdmin=await prisma.user.create({data:{tenantId:foreignTenant.id,name:'Admin ajeno',pinHash:'unused',role:'ADMIN'}})
 const membership=await prisma.tenantMembership.create({data:{accountId:account.id,tenantId:tenant.id,userId:admin.id,role:'OWNER'}})
 const tokenHash=(name)=>createHash('sha256').update(name).digest('hex')
 const now=new Date(), session=await prisma.session.create({data:{tenantId:tenant.id,userId:admin.id,deviceId:'qa-company',tokenHash:tokenHash('active'),expiresAt:new Date(now.getTime()+3600000),reauthenticatedAt:now}})
 const expired=await prisma.session.create({data:{tenantId:tenant.id,userId:admin.id,deviceId:'qa-expired',tokenHash:tokenHash('expired'),expiresAt:new Date(now.getTime()+3600000),reauthenticatedAt:new Date(now.getTime()-11*60*1000)}})
 const foreignSession=await prisma.session.create({data:{tenantId:foreignTenant.id,userId:foreignAdmin.id,deviceId:'qa-foreign',tokenHash:tokenHash('foreign'),expiresAt:new Date(now.getTime()+3600000),reauthenticatedAt:now}})
 const read=await readTenantCompanyProfile({db:prisma,tenantId:tenant.id,actorUserId:admin.id}); eq(read.name,'Empresa QA','read current tenant'); eq(read.ruc,null,'read nullable ruc')
 await assert.rejects(()=>readTenantCompanyProfile({db:prisma,tenantId:foreignTenant.id,actorUserId:admin.id}),/no pertenece/); checks++
 await assert.rejects(()=>updateTenantCompanyProfile({db:prisma,tenantId:tenant.id,actorUserId:seller.id,sessionId:session.id,fields:{name:'No'} }),/permiso|dueño/); checks++
 await assert.rejects(()=>updateTenantCompanyProfile({db:prisma,tenantId:tenant.id,actorUserId:admin.id,sessionId:expired.id,fields:{name:'No'} }),e=>e instanceof CompanyReauthenticationRequiredError); checks++
 await assert.rejects(()=>updateTenantCompanyProfile({db:prisma,tenantId:tenant.id,actorUserId:admin.id,sessionId:foreignSession.id,fields:{name:'No'} }),/Reautenticación requerida/); checks++
 await assert.rejects(()=>updateTenantCompanyProfile({db:prisma,tenantId:tenant.id,actorUserId:admin.id,sessionId:session.id,fields:{settings:'x'}}),/datos públicos/); checks++
 await assert.rejects(()=>updateTenantCompanyProfile({db:prisma,tenantId:tenant.id,actorUserId:admin.id,sessionId:session.id,fields:{email:'qa-b@example.com'}}),/ya lo usa/); checks++
 const changed=await updateTenantCompanyProfile({db:prisma,tenantId:tenant.id,actorUserId:admin.id,sessionId:session.id,fields:{name:'Empresa Actualizada',email:'qa-new@example.com',address:'Av. QA 123',city:'Asunción',department:'Central',phone:'0981000000',ruc:'80000000-1'}})
 eq(changed.name,'Empresa Actualizada','mutates allowlisted fields'); eq(changed.ruc,'80000000-1','persists ruc'); eq(changed.email,'qa-new@example.com','persists contact email')
 const row=await prisma.tenant.findUnique({where:{id:tenant.id},select:{emailVerifiedAt:true}}); eq(row.emailVerifiedAt,null,'email change resets verification')
 const audit=await prisma.auditLog.findFirst({where:{tenantId:tenant.id,action:'TENANT_PROFILE_UPDATED'},orderBy:{createdAt:'desc'}}); ok(audit?.userId===admin.id,'audit actor'); ok(Array.isArray(audit?.metadata?.fields),'audit allowlisted fields')
 const ownerAfter=await prisma.tenantMembership.findUnique({where:{accountId_tenantId:{accountId:account.id,tenantId:tenant.id}},select:{role:true,userId:true}}); eq(ownerAfter.role,'OWNER','owner role unchanged'); eq(ownerAfter.userId,admin.id,'owner identity unchanged')
 console.log(`tenant-company-profile: ${checks} PG checks PASS`)
} finally { if(prisma) await prisma.$disconnect(); if(started) run('pg_ctl',['-D',pgdata,'-m','immediate','-w','stop']); rmSync(root,{recursive:true,force:true}) }
