// #638: contrato de desbloqueo con sesiones y empresas sintéticas en PG descartable.
// Ejecutar: node backend/tests/pin-unlock-pg.mjs
// #172 - Enlace público del borrador (#154): token no enumerable, vencimiento
// con reloj de Postgres, revocación/regeneración, sin datos internos y límite
// de uso. Prueba las rutas reales contra un PostgreSQL descartable.
//
// Uso: node backend/tests/suspended-sales-public.mjs
import assert from 'node:assert/strict'
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
const port = await new Promise(resolve => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)) }) })
const root = mkdtempSync(join(tmpdir(), 'mobos-pin638-'))
const pgdata = join(root, 'pgdata')
const dbUrl = `postgresql://postgres@127.0.0.1:${port}/draft_test`
const run = (bin, args, input) => execFileSync(join(pgBin, bin), args, { input, stdio: ['pipe', 'pipe', 'pipe'] })
let started = false, prisma
try {
  run('initdb', ['-D', pgdata, '--username=postgres', '--auth=trust', '--no-locale', '--encoding=UTF8'])
  run('pg_ctl', ['-D', pgdata, '-l', join(root, 'pg.log'), '-o', `-h 127.0.0.1 -p ${port} -k ${root}`, '-w', 'start']); started = true
  run('createdb', ['-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', 'draft_test'])
  for (const e of readdirSync(join(backend, 'prisma/migrations'), { withFileTypes: true }).filter(e => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', dbUrl], readFileSync(join(backend, 'prisma/migrations', e.name, 'migration.sql')))
  }
  Object.assign(process.env, { DATABASE_URL: dbUrl, NODE_ENV: 'test', MOBOS_APP_URL: 'https://app.example.test', MOBOS_AUTH_SECRET: 'cd'.repeat(32) })
  require.extensions['.ts'] = (m, p) => m._compile(ts.transpileModule(readFileSync(p, 'utf8'), { compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, p)
  ;({ prisma } = require('../lib/prisma.ts'))
  const { hashToken, createSession, createInvitedSellerSession, requireSession } = require('../lib/auth.ts')
  const { POST } = require('../app/api/auth/pin/route.ts')
  const bcrypt = require('bcryptjs')
  const tenant = await prisma.tenant.create({ data: { name: 'Synthetic PIN638', slug: 'pin638', email: 'pin638@example.test' } })
  const user = await prisma.user.create({ data: { tenantId: tenant.id, name: 'Synthetic seller', role: 'ADMIN', pinHash: await bcrypt.hash('2874', 4), pinLength: 4 } })
  const company = await createSession(prisma, tenant.id, null, 'COMPANY', 'fixture638')
  const seller = await createInvitedSellerSession(prisma, user, 'fixture638')
  const request = (cookies, pin='2874') => new Request('https://api.example.test/api/auth/pin', { method:'POST', headers:{origin:'https://app.example.test', cookie:cookies, 'content-type':'application/json'}, body:JSON.stringify({ sellerId:user.id, pin }) })
  async function probe(label,cookies,pin,expectedStatus=401,expectedCode='INVALID_PIN') {
    const r=await POST(request(cookies,pin)); const payload=await r.json()
    assert.equal(r.status,expectedStatus,label)
    if (expectedStatus === 401) assert.equal(payload.code,expectedCode,label)
    if (expectedCode === 'COMPANY_SESSION_REQUIRED') {
      assert.match(payload.message,/Cerrar sesión/)
      assert.match(payload.message,/empresa/)
    }
    console.log('PASS:',label)
  }
  await probe('valid company + correct PIN', `mobos_company_session=${company.accessToken}`, '2874',200)
  await probe('valid company + wrong PIN', `mobos_company_session=${company.accessToken}`, '0129')
  await probe('invitation seller only + correct PIN', `mobos_seller_session=${seller.accessToken}`, '2874',401,'COMPANY_SESSION_REQUIRED')
  await prisma.session.update({where:{id:company.sessionId},data:{expiresAt:new Date(Date.now()-1000)}})
  const both = `mobos_seller_session=${seller.accessToken}; mobos_company_session=${company.accessToken}`
  assert.ok(await requireSession(request(both)), 'seller remains valid after company expires')
  await probe('expired company + live seller + correct PIN', both,'2874',401,'COMPANY_SESSION_REQUIRED')
  const fresh = await createSession(prisma, tenant.id, null, 'COMPANY', 'fixture638')
  const companyCookie = `mobos_company_session=${fresh.accessToken}`
  const alien = await prisma.tenant.create({data:{name:'Other synthetic store',slug:'pin638-other',email:'pin638-other@example.test'}})
  const alienCompany = await createSession(prisma, alien.id, null, 'COMPANY', 'fixture638')
  await probe('wrong company + old sellerId + correct PIN', `mobos_company_session=${alienCompany.accessToken}`)
  const r = request(companyCookie)
  r.headers.set('origin','https://hostile.example.test')
  const hostile = await POST(r); assert.equal(hostile.status,401); assert.equal((await hostile.json()).code,'INVALID_PIN')
  await probe('no cookie + correct PIN','','2874',401,'COMPANY_SESSION_REQUIRED')
  await prisma.user.update({where:{id:user.id},data:{lockedUntil:new Date(Date.now()+60_000)}})
  await probe('locked seller + correct PIN',companyCookie)
  await prisma.user.update({where:{id:user.id},data:{lockedUntil:null,status:'INACTIVE'}})
  await probe('inactive seller + correct PIN',companyCookie)
  await prisma.user.update({where:{id:user.id},data:{status:'ACTIVE'}})
  await probe('correct retry after denied attempt',companyCookie,'2874',200)
  await prisma.session.update({where:{id:fresh.sessionId},data:{revokedAt:new Date()}})
  await probe('revoked company',companyCookie,'2874',401,'COMPANY_SESSION_REQUIRED')
  execFileSync(process.execPath, [join(backend, '../scripts/check-db-schema.mjs')], { cwd: join(backend, '..'), env: process.env, stdio: 'inherit' })
  console.log('PASS: PIN unlock contract; synthetic-only disposable cluster')
} finally {
  if(prisma) await prisma.$disconnect()
  if(started) run('pg_ctl',['-D',pgdata,'-m','fast','-w','stop'])
  rmSync(root,{recursive:true,force:true})
}
