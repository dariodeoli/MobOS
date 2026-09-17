-- Consignación de equipos de terceros: quién dejó el equipo, su contacto y
-- cuánto hay que pagarle al venderse. Aditiva e idempotente.
ALTER TABLE "InventoryUnit" ADD COLUMN IF NOT EXISTS "consignorName" TEXT;
ALTER TABLE "InventoryUnit" ADD COLUMN IF NOT EXISTS "consignorPhone" TEXT;
ALTER TABLE "InventoryUnit" ADD COLUMN IF NOT EXISTS "consignorPyg" INTEGER;
