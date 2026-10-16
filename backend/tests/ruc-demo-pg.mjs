// Solo PostgreSQL descartable propio; ningún proveedor externo ni datos comerciales.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { load, auth, ruc, routeFor, requestFor, payload } from './ruc-demo.test.mjs'
const require = createRequire(import.meta.url)
const { Pool } = require('pg')
const { PrismaClient } = require('@prisma/client')
const { PrismaPg } = require('@prisma/adapter-pg')
const pgBin = process.env.PG_BIN || '/opt/homebrew/bin'
const port = await new Promise(resolve=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})})
const root=mkdtempSync(join(tmpdir(),'mobos-ruc-demo-'))
const pgdata=join(root,'pgdata'), url=`postgresql://postgres@127.0.0.1:${port}/ruc_demo_test`
const run=(bin,args,input)=>execFileSync(join(pgBin,bin),args,{input,stdio:['pipe','pipe','pipe']})
const saved={...process.env};let started=false, checks=0, dbs=[],pool
const ok=(value,label)=>{assert.ok(value,label);checks++}
try {
 run('initdb',['-D',pgdata,'--username=postgres','--auth=trust','--no-locale','--encoding=UTF8'])
 run('pg_ctl',['-D',pgdata,'-l',join(root,'pg.log'),'-o',`-h 127.0.0.1 -p ${port} -k ${root}`,'-w','start']);started=true
 run('createdb',['-h','127.0.0.1','-p',String(port),'-U','postgres','ruc_demo_test'])
 // El único modelo usado: definición de AuthAttempt extraída de la migración real.
 const schema=readFileSync(new URL('../prisma/schema.prisma',import.meta.url),'utf8')
 ok(/model AuthAttempt[\s\S]*?fingerprint\s+String/.test(schema),'usa modelo existente')
 pool=new Pool({connectionString:url,max:10})
 const migration=readFileSync(new URL('../prisma/migrations/20260913-security-auth-controls/migration.sql',import.meta.url),'utf8')
 await pool.query(migration.match(/CREATE TABLE "AuthAttempt" \([\s\S]*?\);/)[0])
 await pool.query('CREATE INDEX ON "AuthAttempt" ("scope", "fingerprint", "createdAt")')
 const client=()=>{const db=new PrismaClient({adapter:new PrismaPg({connectionString:url})});dbs.push(db);return db}
 const db1=client(),db2=client()
 const quotaFor=db=>load('../lib/ruc-demo-quota.ts',{'./prisma':{prisma:db},'./auth':auth,'./ruc':ruc})
 const q1=quotaFor(db1),q2=quotaFor(db2)
 Object.assign(process.env,{RUC_API_KEY:'synthetic-only-test-key',RUC_DEMO_GLOBAL_DAILY_LIMIT:'5',RUC_DEMO_NETWORK_HOURLY_LIMIT:'3',MOBOS_TRUST_PROXY:'true'})
 let fetches=0
 const lookup=input=>ruc.lookupRuc(input,{rejectSimulated:true,fetchImpl:async()=>{fetches++;return Response.json(payload())}})
 const routeForQuota=(q,db)=>routeFor(req=>q.reserveDemoRucQuota(req,{db}),lookup)
 const r1=routeForQuota(q1,db1),r2=routeForQuota(q2,db2)
 const ask=(route,ip,extras={})=>route.GET(requestFor(undefined,{'x-forwarded-for':ip,...extras}))
 // Dos clientes Prisma independientes, todas las reservas contienden el mismo lock real.
 let responses=await Promise.all(Array.from({length:20},(_,i)=>ask(i%2?r1:r2,'203.0.113.10',{'x-device-id':String(i),'x-user-id':String(i)})))
 ok(responses.filter(r=>r.status===200).length===3,'concurrencia red exactamente3');ok(fetches===3,'exactamente3fetch')
 ok(responses.filter(r=>r.status===429).length===17,'resto429');ok(responses.every(r=>r.headers.get('cache-control')==='private, no-store'),'errores no-store')
 ok((await db1.authAttempt.count({where:{scope:'ruc:demo:global'}}))===3,'rechazos red no consumen global')
 responses=await Promise.all(Array.from({length:8},(_,i)=>ask(i%2?r1:r2,`203.0.113.${20+i}`)))
 ok(responses.filter(r=>r.status===200).length===2,'global protege rotaciónIP');ok(fetches===5,'máximo global5fetch')
 const denied=await ask(r1,'203.0.113.99');ok(denied.status===429&&Number(denied.headers.get('retry-after'))>0,'retry positivo')
 // Reinicio de proceso/cliente no reinicia cuotas.
 const db3=client(),q3=quotaFor(db3);ok((await ask(routeForQuota(q3,db3),'203.0.113.120')).status===429,'cuota persistente tras cliente nuevo')
 await db1.authAttempt.deleteMany()
 delete process.env.MOBOS_TRUST_PROXY
 responses=await Promise.all(Array.from({length:10},(_,i)=>ask(i%2?r1:r2,`203.0.113.${i}`,{'x-real-ip':`198.51.100.${i}`,'x-mobos-client-ip':`192.0.2.${i}`,'x-mobos-pass':'1'})))
 ok(responses.filter(r=>r.status===200).length===3,'noTRUST_PROXY todos bucket desconocido');ok((await db1.authAttempt.findMany({where:{scope:'ruc:demo:network'}})).every(row=>!/203\.|198\.|192\./.test(row.fingerprint)),'IP no persistida en claro')
 await db1.authAttempt.deleteMany();process.env.MOBOS_TRUST_PROXY='true'
 // Cabecera falsa al principio no cambia red del proxy derecho.
 responses=await Promise.all(Array.from({length:9},(_,i)=>ask(r1,`192.0.2.${i}, 203.0.113.200`)))
 ok(responses.filter(r=>r.status===200).length===3,'forjar primerXFF no rota red')
 // Errores upstream consumen intento, no permiten bucle gratuito.
 await db1.authAttempt.deleteMany();const failed=routeFor(req=>q1.reserveDemoRucQuota(req,{db:db1}),async()=>{fetches++;throw new Error('upstream-canary')})
 responses=await Promise.all(Array.from({length:6},()=>ask(failed,'203.0.113.201')))
 ok(responses.filter(r=>r.status===503).length===3&&responses.filter(r=>r.status===429).length===3,'upstreamfailure conserva cuota')
 // Fallo DB no puede llamar proveedor y transacción parcial se revierte.
 const before=fetches;const broken=routeFor(req=>q1.reserveDemoRucQuota(req,{db:{$transaction:async()=>{throw new Error('db-canary')}}}),lookup)
 ok((await ask(broken,'203.0.113.202')).status===503&&fetches===before,'DBfail0fetch')
 await db1.authAttempt.deleteMany()
 await pool.query(`CREATE FUNCTION fail_network() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.scope='ruc:demo:network' THEN RAISE EXCEPTION 'synthetic failure'; END IF; RETURN NEW; END $$`)
 await pool.query('CREATE TRIGGER fail_network BEFORE INSERT ON "AuthAttempt" FOR EACH ROW EXECUTE FUNCTION fail_network()')
 ok((await ask(r1,'203.0.113.203')).status===503,'fallo segunda inserción seguro');ok(await db1.authAttempt.count()===0,'rollbackninguna reserva parcial');ok(fetches===before,'rollback0fetch')
 await pool.query('DROP TRIGGER fail_network ON "AuthAttempt"')
 // Reloj DB tras lock: demora controlada; createdAt debe ser posterior a liberar lock.
 const hash=auth.hashToken('ruc:demo:global'),key=`ruc:demo:global:${hash}`
 const blocker=await pool.connect();await blocker.query('BEGIN');await blocker.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[key])
 const pending=ask(r2,'203.0.113.204')
 let blocked=false
 for(let i=0;i<80;i++){const found=await pool.query("SELECT 1 FROM pg_stat_activity WHERE datname='ruc_demo_test' AND cardinality(pg_blocking_pids(pid))>0");if(found.rowCount){blocked=true;break}await new Promise(resolve=>setTimeout(resolve,10))}
 ok(blocked,'barrera demuestra espera lock PostgreSQL')
 const released=(await blocker.query('SELECT clock_timestamp() AS now')).rows[0].now
 await blocker.query('COMMIT');blocker.release();ok((await pending).status===200,'reserva después desbloqueo')
 const row=await db1.authAttempt.findFirst({where:{scope:'ruc:demo:global'}});ok(row.createdAt.getTime()>=released.getTime()-1,'createdAtrelojpostlock')
 // Ventanas independientes: una hora libera red, pero global conserva24h.
 await pool.query(`UPDATE "AuthAttempt" SET "createdAt"=(clock_timestamp() AT TIME ZONE 'UTC')-interval '2 hours'`)
 process.env.RUC_DEMO_GLOBAL_DAILY_LIMIT='1';const countBefore=fetches
 ok((await ask(r1,'203.0.113.205')).status===429&&fetches===countBefore,'global24h no se reinicia al vencer red')
 await pool.query(`UPDATE "AuthAttempt" SET "createdAt"=(clock_timestamp() AT TIME ZONE 'UTC')-interval '25 hours'`)
 ok((await ask(r1,'203.0.113.204')).status===200,'ambas ventanas vencidas permiten reserva nueva')
 ok(await db1.authAttempt.count()===2,'limpieza solo scopes usados')
 console.log(`RUC demo PostgreSQL: ${checks} PASS (cluster aislado; proveedor mock)`)
}finally{
 await Promise.all(dbs.map(db=>db.$disconnect()));if(pool)await pool.end()
 if(started)run('pg_ctl',['-D',pgdata,'-m','fast','-w','stop']);rmSync(root,{recursive:true,force:true})
 for(const key of Object.keys(process.env))if(!(key in saved))delete process.env[key];Object.assign(process.env,saved)
}
