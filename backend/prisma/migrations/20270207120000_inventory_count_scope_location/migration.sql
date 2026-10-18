-- #557: agrega alcance/ubicación al conteo y conserva el resultado para reintentos idempotentes.
BEGIN;
DO $$ BEGIN
  CREATE TYPE "InventoryCountScope" AS ENUM ('FULL', 'PARTIAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
ALTER TABLE "InventoryCount" ADD COLUMN IF NOT EXISTS "locationId" TEXT;
ALTER TABLE "InventoryCount" ADD COLUMN IF NOT EXISTS "scope" "InventoryCountScope" NOT NULL DEFAULT 'PARTIAL';
ALTER TABLE "InventoryCount" ADD COLUMN IF NOT EXISTS "applyResult" JSONB;
ALTER TABLE "InventoryCount" ADD COLUMN IF NOT EXISTS "stockSnapshot" JSONB;
ALTER TABLE "InventoryCount" ADD COLUMN IF NOT EXISTS "serialSnapshot" JSONB;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InventoryCount_locationId_fkey' AND conrelid = '"InventoryCount"'::regclass) THEN
    ALTER TABLE "InventoryCount" ADD CONSTRAINT "InventoryCount_locationId_fkey"
      FOREIGN KEY ("locationId") REFERENCES "StockLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "InventoryCount_tenantId_locationId_status_idx" ON "InventoryCount"("tenantId", "locationId", "status");
COMMIT;
