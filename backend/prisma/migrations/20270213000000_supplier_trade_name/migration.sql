-- Nombre de fantasía del proveedor (nombre comercial). Aditiva e idempotente.
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "tradeName" TEXT;
