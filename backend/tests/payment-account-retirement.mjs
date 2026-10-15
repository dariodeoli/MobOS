import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const url = process.argv[2] || process.env.DATABASE_URL
const target = new URL(url)
if (!['localhost','127.0.0.1'].includes(target.hostname) || !/^\/mobos_(it|e2e|qa486)/.test(target.pathname)) throw Error('Solo base temporal de pruebas explícita')
const psql = `${process.env.MOBOS_TEST_PG_BIN || '/opt/homebrew/bin'}/psql`
const query = sql => execFileSync(psql, [url,'-v','ON_ERROR_STOP=1','-At','-c',sql], {encoding:'utf8'})
const migration = fileURLToPath(new URL('../prisma/migrations/20270204120000_retire_seeded_payment_accounts/migration.sql',import.meta.url))
query(`INSERT INTO "Tenant" ("id","name","slug","updatedAt") VALUES ('qa486-a','QA486 A','qa486-a',now()),('qa486-b','QA486 B','qa486-b',now());
INSERT INTO "PaymentAccount" ("id","tenantId","name","bank","currency","kind","updatedAt","holder") VALUES
('qa486-auto-a','qa486-a','UENO BANK','UENO BANK','PYG','TRANSFER',now(),null),
('qa486-auto-b','qa486-b','DINELCO','DINELCO','PYG','CARD',now(),null),
('qa486-used','qa486-a','DINERO','DINERO','PYG','CASH',now(),null),
('qa486-manual','qa486-a','UENO BANK','UENO BANK','PYG','TRANSFER',now(),null),
('qa486-personal','qa486-a','CONTINENTAL','CONTINENTAL','PYG','TRANSFER',now(),'Cuenta real'),
('qa486-edited','qa486-a','FAMILIAR','FAMILIAR','PYG','TRANSFER',now(),null),
('qa486-foreign','qa486-a','POS UENO','POS UENO','PYG','CARD',now(),null);
INSERT INTO "AuditLog" ("id","tenantId","action","entity","entityId","metadata")
SELECT 'qa486-seed-'||"id","tenantId",'PAYMENT_ACCOUNT_CREATED','PaymentAccount',"id",jsonb_build_object('seeded',true,'after',to_jsonb(a)) FROM "PaymentAccount" a WHERE "id" LIKE 'qa486-%' AND "id" NOT IN ('qa486-manual','qa486-foreign');
INSERT INTO "AuditLog" ("id","tenantId","action","entity","entityId","metadata") VALUES
('qa486-edit','qa486-a','PAYMENT_ACCOUNT_UPDATED','PaymentAccount','qa486-edited','{}'),
('qa486-bad-seed','qa486-b','PAYMENT_ACCOUNT_CREATED','PaymentAccount','qa486-foreign','{"seeded":true,"after":{"name":"POS UENO","bank":"POS UENO","kind":"CARD","currency":"PYG"}}');
INSERT INTO "CashMovement" ("id","tenantId","accountId","createdById","kind","direction","originalAmount","amountPyg","description","updatedAt") VALUES ('qa486-movement','qa486-a','qa486-used','qa486-user','ADJUSTMENT','IN',25000,25000,'Historial a conservar',now());`)
try {
 const before = query(`SELECT row_to_json(m) FROM "CashMovement" m WHERE "id"='qa486-movement'`)
 for(let i=0;i<2;i++) execFileSync(psql,[url,'-v','ON_ERROR_STOP=1','-q','-f',migration],{stdio:'pipe'})
 assert.equal(query(`SELECT row_to_json(m) FROM "CashMovement" m WHERE "id"='qa486-movement'`),before)
 assert.equal(query(`SELECT count(*) FROM "PaymentAccount" WHERE "id" IN ('qa486-auto-a','qa486-auto-b','qa486-used') AND NOT "isActive"`).trim(),'3')
 assert.equal(query(`SELECT count(*) FROM "PaymentAccount" WHERE "id" IN ('qa486-manual','qa486-personal','qa486-edited','qa486-foreign') AND "isActive"`).trim(),'4')
 assert.equal(query(`SELECT count(*) FROM "AuditLog" WHERE "action"='PAYMENT_ACCOUNT_DEFAULT_RETIRED' AND "entityId" LIKE 'qa486-%'`).trim(),'3')
 assert.equal(query(`SELECT count(*) FROM "AuditLog" WHERE "action"='PAYMENT_ACCOUNT_DEFAULT_RETIRED' AND "entityId" LIKE 'qa486-%' AND "metadata"->'before'->>'isActive'='true' AND "metadata"->>'disposition'='archived'`).trim(),'3')
 console.log('PASS #486: dos empresas, solo ejemplos comprobados, cuenta manual/personalizada/editada/empresa ajena intactas, historial intacto, respaldo y doble aplicación')
} finally { query(`DELETE FROM "Tenant" WHERE "id" IN ('qa486-a','qa486-b')`) }
