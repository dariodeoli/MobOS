-- Umbral de venta bajo lista sin autorización (porcentaje, default de la app
-- 10%). Aditiva, idempotente y re-ejecutable: la columna puede existir por una
-- corrida previa.
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "belowListPct" INTEGER;
