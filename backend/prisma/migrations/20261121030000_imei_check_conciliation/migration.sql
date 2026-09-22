-- #231/#233: conciliación de consultas IMEI (estado pendiente con el proveedor).
-- Aditiva e idempotente.
ALTER TABLE "ImeiCheckQuery" ADD COLUMN IF NOT EXISTS "conciliatedAt" TIMESTAMP(3);
ALTER TABLE "ImeiCheckQuery" ADD COLUMN IF NOT EXISTS "conciliationNote" TEXT;
