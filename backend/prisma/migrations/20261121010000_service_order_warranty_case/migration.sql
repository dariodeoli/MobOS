-- #224: la orden de servicio puede originarse en una garantía (conversión con historial).
-- Aditiva, idempotente y re-ejecutable.
ALTER TABLE "ServiceOrder" ADD COLUMN IF NOT EXISTS "warrantyCaseId" TEXT;
CREATE INDEX IF NOT EXISTS "ServiceOrder_warrantyCaseId_idx" ON "ServiceOrder"("warrantyCaseId");
ALTER TABLE "ServiceOrder" DROP CONSTRAINT IF EXISTS "ServiceOrder_warrantyCaseId_fkey";
ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_warrantyCaseId_fkey" FOREIGN KEY ("warrantyCaseId") REFERENCES "WarrantyCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
