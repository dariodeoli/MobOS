// #509: contrato real HTTP + PG, solo base aislada explícita. Sin .env/credenciales.
import assert from 'node:assert/strict'
import {randomBytes,createHash} from 'node:crypto'
import {PrismaClient} from '@prisma/client'
import {PrismaPg} from '@prisma/adapter-pg'
const [base,databaseUrl]=process.argv.slice(2)
const db=new URL(databaseUrl),api=new URL(base)
assert.ok(['127.0.0.1','localhost'].includes(db.hostname)&&/^\/(?:mobos_runtime_509|mobos_it|mobos_e2e(?:_[a-z0-9_]+)?)$/.test(db.pathname))
assert.ok(['127.0.0.1','localhost'].includes(api.hostname))
const prisma=new PrismaClient({adapter:new PrismaPg({connectionString:databaseUrl})})
const tenants=[],accounts=[];let checks=0
const check=(value,label)=>{assert.ok(value,label);checks++}
async function call(path,token){const r=await fetch(`${base}${path}`,{headers:{Authorization:`Bearer ${token}`}});return{status:r.status,body:await r.json()}}
async function seller(tenant,role,account=null){
 const user=await prisma.user.create({data:{tenantId:tenant.id,name:`QA509-${role}`,role,pinHash:'not-a-login-hash'}})
 const token=randomBytes(32).toString('hex')
 await prisma.session.create({data:{tenantId:tenant.id,userId:user.id,accountId:account?.id||null,level:'SELLER',deviceId:'qa509',tokenHash:createHash('sha256').update(token).digest('hex'),expiresAt:new Date(Date.now()+3600000)}})
 return{user,token}
}
try{
 const stamp=randomBytes(5).toString('hex')
 const a=await prisma.tenant.create({data:{name:'QA509 A',slug:`qa509-a-${stamp}`}});tenants.push(a.id)
 const b=await prisma.tenant.create({data:{name:'QA509 B',slug:`qa509-b-${stamp}`}});tenants.push(b.id)
 const foreign=await prisma.tenant.create({data:{name:'QA509 Foreign',slug:`qa509-f-${stamp}`}});tenants.push(foreign.id)
 const unlinked=await seller(a,'VENDEDOR')
 let r=await call('/api/auth/me',unlinked.token)
 check(r.status===200&&r.body.user.canManageCompanies===false,'sesión vendedor válida sin cuenta → capacidad false')
 check((await call('/api/auth/tenants',unlinked.token)).status===401,'el endpoint no flexibiliza la denegación sin cuenta')
 const account=await prisma.account.create({data:{email:`qa509-${stamp}@example.invalid`}});accounts.push(account.id)
 const owner=await seller(a,'ADMIN',account)
 await prisma.tenantMembership.create({data:{tenantId:a.id,accountId:account.id,userId:owner.user.id,role:'OWNER'}})
 await prisma.tenantMembership.create({data:{tenantId:b.id,accountId:account.id,role:'MEMBER'}})
 r=await call('/api/auth/me',owner.token)
 check(r.status===200&&r.body.user.canManageCompanies===true,'perfil vinculado con cuenta válida → capacidad true')
 r=await call('/api/auth/tenants',owner.token)
 check(r.status===200&&r.body.tenants.length===2&&r.body.tenants.every(t=>[a.id,b.id].includes(t.id)),'listado conserva alcance real de pertenencias; nunca foreign')
 const coworker=await seller(a,'ADMIN',account)
 r=await call('/api/auth/me',coworker.token)
 check(r.status===200&&r.body.user.canManageCompanies===false,'mismo rol y cuenta pero perfil ajeno → false')
 check((await call('/api/auth/tenants',coworker.token)).status===401,'perfil ajeno sigue sin acceso al listado')
 const memberAccount=await prisma.account.create({data:{email:`qa509-member-${stamp}@example.invalid`}});accounts.push(memberAccount.id)
 const member=await seller(a,'VENDEDOR',memberAccount)
 await prisma.tenantMembership.create({data:{tenantId:a.id,accountId:memberAccount.id,userId:member.user.id,role:'MEMBER'}})
 r=await call('/api/auth/me',member.token)
 check(r.status===200&&r.body.user.canManageCompanies===true,'capacidad se basa en contexto de cuenta, no rol ADMIN')
 await prisma.session.updateMany({where:{userId:unlinked.user.id},data:{revokedAt:new Date()}})
 check((await call('/api/auth/me',unlinked.token)).status===401,'revocación real permanece401')
 console.log(`auth-context509: ${checks} checks PASS`)
}finally{
 for(const id of tenants)await prisma.tenant.delete({where:{id}})
 for(const id of accounts)await prisma.account.delete({where:{id}})
 await prisma.$disconnect()
}
