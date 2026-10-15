-- #486: retirar exclusivamente esqueletos automáticos sin personalización.
-- Se archivan sin borrar filas ni movimientos; se conserva una copia completa.
-- Mantener las filas también impide resiembras del contenedor anterior durante el rolling deploy.
BEGIN;
WITH candidates AS MATERIALIZED (
 SELECT a.*
 FROM "PaymentAccount" a
 WHERE a."isActive" = true
   AND a."name" IN ('UENO BANK','POS UENO','PIK ITAÚ','DINELCO','DINERO','CONTINENTAL','FAMILIAR')
   AND a."bank" = a."name" AND a."currency" = 'PYG'
   AND a."kind"::text = CASE WHEN a."name" = 'DINERO' THEN 'CASH' WHEN a."name" IN ('POS UENO','DINELCO') THEN 'CARD' ELSE 'TRANSFER' END
   AND a."feePercent" = 0 AND a."discountPct" = 0 AND a."settlementDays" = 0
   AND COALESCE(a."holder",'') = '' AND COALESCE(a."accountNumber",'') = ''
   AND COALESCE(a."document",'') = '' AND COALESCE(a."processor",'') = ''
   AND COALESCE(a."pixKey",'') = '' AND COALESCE(a."reference",'') = ''
   AND COALESCE(a."currencyLabel",'') = '' AND COALESCE(a."aliasType",'') = ''
   AND COALESCE(a."aliasValue",'') = '' AND a."holderId" IS NULL AND a."companyId" IS NULL
   AND EXISTS (SELECT 1 FROM "AuditLog" log
     WHERE log."tenantId" = a."tenantId" AND log."entity" = 'PaymentAccount' AND log."entityId" = a."id"
       AND log."action" = 'PAYMENT_ACCOUNT_CREATED' AND log."metadata"->'seeded' = 'true'::jsonb
       AND log."metadata"->'after'->>'name' = a."name"
       AND log."metadata"->'after'->>'bank' = a."bank"
       AND log."metadata"->'after'->>'kind' = a."kind"::text
       AND log."metadata"->'after'->>'currency' = a."currency"::text)
   AND NOT EXISTS (SELECT 1 FROM "AuditLog" log WHERE log."tenantId" = a."tenantId" AND log."entity" = 'PaymentAccount'
       AND log."entityId" = a."id" AND log."action" = 'PAYMENT_ACCOUNT_UPDATED')
 FOR UPDATE OF a
), backed_up AS (
 INSERT INTO "AuditLog" ("id","tenantId","action","entity","entityId","metadata")
 SELECT 'default486-' || md5("id"), "tenantId", 'PAYMENT_ACCOUNT_DEFAULT_RETIRED', 'PaymentAccount', "id",
   jsonb_build_object('before',to_jsonb(candidates),'disposition','archived',
     'reason','Cuenta de ejemplo creada automáticamente sin personalización','migration','20270204120000_retire_seeded_payment_accounts')
 FROM candidates ON CONFLICT ("id") DO NOTHING RETURNING "entityId","tenantId"
)
UPDATE "PaymentAccount" a SET "isActive" = false, "updatedAt" = CURRENT_TIMESTAMP
FROM candidates c JOIN backed_up b ON b."entityId" = c."id" AND b."tenantId" = c."tenantId"
WHERE a."id" = c."id" AND a."tenantId" = c."tenantId";
COMMIT;
