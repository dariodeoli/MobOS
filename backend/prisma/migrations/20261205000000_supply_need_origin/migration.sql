-- #250 F1 · Abastecimiento: centro de compra (origen) por necesidad.
-- Aditiva e idempotente: las necesidades ya cargadas quedan sin centro hasta
-- que se asignen desde el panel.
ALTER TABLE "SupplyNeed" ADD COLUMN IF NOT EXISTS "origin" TEXT;

CREATE INDEX IF NOT EXISTS "SupplyNeed_tenantId_status_origin_idx" ON "SupplyNeed"("tenantId", "status", "origin");
