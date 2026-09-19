-- Dos variantes del logo de la empresa: 'light' (logo oscuro, para modo claro)
-- y 'dark' (logo claro, para modo oscuro). Aditivo e idempotente: lo existente
-- queda como 'light' y el único pasa de (tenantId) a (tenantId, variant).
ALTER TABLE "TenantLogo" ADD COLUMN IF NOT EXISTS "variant" TEXT NOT NULL DEFAULT 'light';

DROP INDEX IF EXISTS "TenantLogo_tenantId_key";

CREATE UNIQUE INDEX IF NOT EXISTS "TenantLogo_tenantId_variant_key" ON "TenantLogo"("tenantId", "variant");
