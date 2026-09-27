-- #268 · Unificar clientes duplicados: la ficha fusionada no se borra.
-- Aditiva e idempotente: las fichas existentes quedan sin archivar y sin
-- puntero hasta que se unifiquen.
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "mergedIntoId" TEXT;

CREATE INDEX IF NOT EXISTS "Customer_tenantId_archivedAt_idx" ON "Customer"("tenantId", "archivedAt");
CREATE INDEX IF NOT EXISTS "Customer_mergedIntoId_idx" ON "Customer"("mergedIntoId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Customer_mergedIntoId_fkey'
  ) THEN
    ALTER TABLE "Customer"
      ADD CONSTRAINT "Customer_mergedIntoId_fkey"
      FOREIGN KEY ("mergedIntoId") REFERENCES "Customer"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
