-- Seguridad #172/#178: hash de tokens públicos legacy en las superficies del
-- CRM (garantías y portal del cliente). Aditiva, idempotente y re-ejecutable.
--
-- Los enlaces emitidos antes de este cambio siguen funcionando: su token en
-- claro queda en la columna legacy y el hash se calcula acá mismo. Las rutas
-- públicas resuelven primero por hash y, si no hay match, por el token legacy
-- (plan de rotación: al regenerar el enlace, el token en claro se borra).
ALTER TABLE "WarrantyCase" ADD COLUMN IF NOT EXISTS "publicTokenHash" TEXT;
ALTER TABLE "CustomerPortalToken" ADD COLUMN IF NOT EXISTS "tokenHash" TEXT;
ALTER TABLE "CustomerPortalToken" ALTER COLUMN "token" DROP NOT NULL;

-- Backfill idempotente: sha256 hex del token legacy tal cual se guardó
-- (mismo cálculo que createHash('sha256') en Node).
UPDATE "WarrantyCase"
SET "publicTokenHash" = encode(sha256(convert_to("publicToken", 'UTF8')), 'hex')
WHERE "publicToken" IS NOT NULL AND "publicTokenHash" IS NULL;

UPDATE "CustomerPortalToken"
SET "tokenHash" = encode(sha256(convert_to("token", 'UTF8')), 'hex')
WHERE "token" IS NOT NULL AND "tokenHash" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "WarrantyCase_publicTokenHash_key" ON "WarrantyCase"("publicTokenHash");
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerPortalToken_tokenHash_key" ON "CustomerPortalToken"("tokenHash");
