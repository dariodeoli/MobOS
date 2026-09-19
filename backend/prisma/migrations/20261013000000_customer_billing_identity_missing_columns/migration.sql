-- La migración 20261005000000 creó "CustomerBillingIdentity" con CREATE TABLE
-- IF NOT EXISTS y sin las columnas del modelo (uses, lastUsedAt, updatedAt) y
-- con "document" obligatorio. Como la tabla ya existía, esas diferencias nunca
-- se aplicaron y el registro de titulares fallaba al guardar/usar. Migración
-- correctiva, idempotente y re-ejecutable.
ALTER TABLE "CustomerBillingIdentity" ADD COLUMN IF NOT EXISTS "uses" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CustomerBillingIdentity" ADD COLUMN IF NOT EXISTS "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "CustomerBillingIdentity" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "CustomerBillingIdentity" ALTER COLUMN "document" DROP NOT NULL;
