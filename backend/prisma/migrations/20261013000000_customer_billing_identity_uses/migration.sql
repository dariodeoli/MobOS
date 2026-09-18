-- La tabla CustomerBillingIdentity se creó primero con la migración que no
-- incluía uses/lastUsedAt/updatedAt (o al revés según el orden de aplicación),
-- y las migraciones posteriores usaron IF NOT EXISTS: las columnas faltantes
-- nunca se agregaron en bases creadas fuera de orden. Esta migración las
-- completa de forma idempotente.

ALTER TABLE "CustomerBillingIdentity" ADD COLUMN IF NOT EXISTS "uses" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CustomerBillingIdentity" ADD COLUMN IF NOT EXISTS "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "CustomerBillingIdentity" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
