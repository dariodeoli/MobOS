-- #233: conciliación de consultas ambiguas (timeout) del proveedor de IMEI.
ALTER TABLE "ImeiCheckQuery" ADD COLUMN IF NOT EXISTS "conciliatedAt" TIMESTAMP(3);
ALTER TABLE "ImeiCheckQuery" ADD COLUMN IF NOT EXISTS "conciliationNote" TEXT;
