// Prueba de la migración 20270105000000_unit_sheet_fields (#400, unidad A)
// contra Postgres real: backfill del correlativo por fecha de ingreso
// (incluye eliminadas, por empresa), ciclos desde la inspección, siembra de
// TenantSequence, trigger, idempotencia al re-aplicar y base vacía.
//
// Uso: UNIT_CODE_PG_URL=postgresql://user@127.0.0.1:55892 node tests/unit-code-migration.mjs
// (URL del servidor SIN nombre de base; las bases temporales se borran al final.)
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import pg from 'pg'

const server = process.env.UNIT_CODE_PG_URL
if (!server) {
  console.error('Falta UNIT_CODE_PG_URL (servidor Postgres de prueba, sin base).')
  process.exit(2)
}
const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'prisma', 'migrations')
const NEW = '20270105000000_unit_sheet_fields'
const todas = readdirSync(migrationsDir, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort()
if (!todas.includes(NEW)) throw new Error(`No existe la migración ${NEW}.`)
const names = todas.slice(0, todas.indexOf(NEW) + 1)
const sql = name => readFileSync(path.join(migrationsDir, name, 'migration.sql'), 'utf8')

const stamp = Date.now().toString(36)
const admin = new pg.Client({ connectionString: `${server}/postgres` })
const dbs = []
let checks = 0
const ok = (condition, label) => {
  if (!condition) throw new Error(`FALLÓ: ${label}`)
  checks += 1
  console.log(`ok · ${label}`)
}

async function scratch(label) {
  const name = `unit_code_${label}_${stamp}`
  await admin.query(`CREATE DATABASE "${name}"`)
  dbs.push(name)
  const client = new pg.Client({ connectionString: `${server}/${name}` })
  await client.connect()
  return client
}

async function seed(db) {
  await db.query(`INSERT INTO "Tenant" ("id","name","slug","updatedAt") VALUES ('t1','T1','t1-${stamp}',now()),('t2','T2','t2-${stamp}',now()),('t3','T3','t3-${stamp}',now())`)
  await db.query(`INSERT INTO "Branch" ("id","tenantId","name","updatedAt") VALUES ('b1','t1','B1',now()),('b2','t2','B2',now()),('b3','t3','B3',now())`)
  for (const [id, tenant, branch] of [['p1', 't1', 'b1'], ['p2', 't2', 'b2']]) {
    await db.query(`INSERT INTO "Product" ("id","tenantId","branchId","sku","name","pricePyg","updatedAt") VALUES ($1,$2,$3,$4,'Producto',1000,now())`, [id, tenant, branch, `sku-${id}`])
  }
  // Orden de ingreso de t1: u-b (2026-01) < u-a (2026-02, id menor pero más nuevo) < u-c1/u-c2 (misma fecha, desempata el id) < u-del (eliminada, 2026-04).
  const u = (id, tenant, product, branch, created, extra = '') => db.query(
    `INSERT INTO "InventoryUnit" ("id","tenantId","productId","branchId","serial","createdAt","updatedAt" ${extra ? ',' + extra.cols : ''}) VALUES ($1,$2,$3,$4,$5,$6::timestamp,now() ${extra ? ',' + extra.vals : ''})`, [id, tenant, product, branch, `S-${id}`, created])
  await u('u-a', 't1', 'p1', 'b1', '2026-02-01 10:00:00', { cols: `"inspection"`, vals: `'{"bateriaCiclos": 312, "x": 1}'::jsonb` })
  await u('u-b', 't1', 'p1', 'b1', '2026-01-01 10:00:00', { cols: `"inspection"`, vals: `'{"bateriaCiclos": "88"}'::jsonb` })
  await u('u-c2', 't1', 'p1', 'b1', '2026-03-01 10:00:00', { cols: `"inspection"`, vals: `'{"bateriaCiclos": "mucho"}'::jsonb` })
  await u('u-c1', 't1', 'p1', 'b1', '2026-03-01 10:00:00', { cols: `"inspection"`, vals: `'[1,2]'::jsonb` })
  await u('u-del', 't1', 'p1', 'b1', '2026-04-01 10:00:00', { cols: `"removedAt"`, vals: `now()` })
  await u('u-t2a', 't2', 'p2', 'b2', '2026-05-01 10:00:00')
  await u('u-t2b', 't2', 'p2', 'b2', '2025-12-01 10:00:00')
}

const seqs = async db => Object.fromEntries((await db.query(`SELECT "id","internalSeq","batteryCycles" FROM "InventoryUnit"`)).rows.map(row => [row.id, row]))

try {
  await admin.connect()

  // ── Base vacía: toda la cadena aplica y es re-ejecutable ──
  const vacia = await scratch('empty')
  for (const name of names) await vacia.query(sql(name))
  ok(true, 'base vacía: la cadena completa aplica')
  await vacia.query(sql(NEW))
  ok(true, 'base vacía: re-aplicar la migración no falla (idempotente)')
  const trig = await vacia.query(`SELECT 1 FROM pg_trigger WHERE tgname = 'InventoryUnit_assign_internal_seq' AND NOT tgisinternal`)
  ok(trig.rowCount === 1, 'el trigger existe una sola vez')
  await vacia.end()

  // ── Base en la migración anterior, con datos ──
  const previa = await scratch('prev')
  for (const name of names.filter(item => item !== NEW)) await previa.query(sql(name))
  await seed(previa)
  await previa.query(sql(NEW))
  const antes = await seqs(previa)
  ok(antes['u-b'].internalSeq === 1 && antes['u-a'].internalSeq === 2, 'backfill por fecha de ingreso (u-b antes que u-a aunque su id sea mayor)')
  ok(antes['u-c1'].internalSeq === 3 && antes['u-c2'].internalSeq === 4, 'misma fecha: desempata por id')
  ok(antes['u-del'].internalSeq === 5, 'las unidades eliminadas también ocupan número (nunca se reutiliza)')
  ok(antes['u-t2b'].internalSeq === 1 && antes['u-t2a'].internalSeq === 2, 'cada empresa numera desde 1, aislada de las demás')
  ok(antes['u-a'].batteryCycles === 312, 'ciclos desde inspection.bateriaCiclos (número)')
  ok(antes['u-b'].batteryCycles === 88, 'ciclos desde inspection.bateriaCiclos (texto entero)')
  ok(antes['u-c2'].batteryCycles === null && antes['u-c1'].batteryCycles === null, 'ciclos no numéricos o inspección no-objeto quedan en null')
  const contadores = Object.fromEntries((await previa.query(`SELECT "tenantId","next" FROM "TenantSequence" WHERE "key" = 'unit'`)).rows.map(row => [row.tenantId, Number(row.next)]))
  ok(contadores.t1 === 6 && contadores.t2 === 3 && !('t3' in contadores), 'TenantSequence sembrada con máximo + 1 (sin fila para empresas sin unidades)')

  // Insert posterior: raw SQL recibe el siguiente; t3 arranca en 1.
  const ins = (id, tenant, product, branch) => previa.query(`INSERT INTO "InventoryUnit" ("id","tenantId","productId","branchId","serial","updatedAt") VALUES ($1,$2,$3,$4,$5,now()) RETURNING "internalSeq"`, [id, tenant, product, branch, `S-${id}`])
  ok((await ins('n1', 't1', 'p1', 'b1')).rows[0].internalSeq === 6, 'insert posterior de t1 recibe 6')
  ok((await ins('n2', 't1', 'p1', 'b1')).rows[0].internalSeq === 7, 'y luego 7')
  ok((await ins('n3', 't2', 'p2', 'b2')).rows[0].internalSeq === 3, 'insert de t2 recibe 3 (independiente de t1)')
  await previa.query(`INSERT INTO "Product" ("id","tenantId","branchId","sku","name","pricePyg","updatedAt") VALUES ('p3','t3','b3','sku-p3','Producto',1000,now())`)
  ok((await ins('n4', 't3', 'p3', 'b3')).rows[0].internalSeq === 1, 'una empresa sin unidades previas empieza en 1')

  // Re-aplicar: 0 cambios sobre datos y contadores.
  const foto = async () => JSON.stringify([(await seqs(previa)), (await previa.query(`SELECT "tenantId","key","next"::text FROM "TenantSequence" ORDER BY 1,2`)).rows])
  const antesFoto = await foto()
  await previa.query(sql(NEW))
  ok(antesFoto === await foto(), 're-aplicar la migración con datos no cambia correlativos, ciclos ni contadores')

  // MOV-9999 → MOV-10000: el contador cruza los 4 dígitos sin tope.
  await previa.query(`UPDATE "TenantSequence" SET "next" = 9999 WHERE "tenantId" = 't3' AND "key" = 'unit'`)
  const a = (await ins('big1', 't3', 'p3', 'b3')).rows[0].internalSeq
  const b = (await ins('big2', 't3', 'p3', 'b3')).rows[0].internalSeq
  ok(a === 9999 && b === 10000, 'el contador cruza 9999 → 10000')

  // La FK de TenantSequence limpia al borrar la empresa.
  await previa.query(`DELETE FROM "InventoryUnit" WHERE "tenantId" = 't3'`)
  await previa.query(`DELETE FROM "Product" WHERE "tenantId" = 't3'`)
  await previa.query(`DELETE FROM "Branch" WHERE "tenantId" = 't3'`)
  await previa.query(`DELETE FROM "Tenant" WHERE "id" = 't3'`)
  ok((await previa.query(`SELECT 1 FROM "TenantSequence" WHERE "tenantId" = 't3'`)).rowCount === 0, 'borrar la empresa elimina sus contadores (ON DELETE CASCADE)')

  // El trigger no toma un lock fuerte sobre el Tenant (lib/order-number.ts lo
  // bloquea en cada venta): con una unidad sin confirmar, otra conexión puede
  // tomar FOR NO KEY UPDATE sobre el Tenant sin esperar (la FK de la unidad
  // ya toma solo FOR KEY SHARE, que no lo bloquea).
  const url = `${server}/${dbs[dbs.length - 1]}`
  const abierta = new pg.Client({ connectionString: url }), otra = new pg.Client({ connectionString: url })
  await abierta.connect(); await otra.connect()
  await abierta.query('BEGIN')
  await abierta.query(`INSERT INTO "InventoryUnit" ("id","tenantId","productId","branchId","serial","updatedAt") VALUES ('lk1','t1','p1','b1','S-lk1',now())`)
  await otra.query(`SET lock_timeout = '1500ms'`)
  await otra.query('BEGIN')
  await otra.query(`SELECT 1 FROM "Tenant" WHERE "id" = 't1' FOR NO KEY UPDATE`)
  await otra.query('COMMIT')
  ok(true, 'una unidad en curso no bloquea el UPDATE del Tenant (sin lock fuerte sobre la fila)')
  await abierta.query('ROLLBACK')
  await abierta.end(); await otra.end()
  await previa.end()
  console.log(`unit-code-migration: OK (${checks} comprobaciones)`)
} finally {
  for (const name of dbs) await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`).catch(() => {})
  await admin.end()
}
