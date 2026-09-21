-- CRM #224: una garantía puede ingresar a servicio conservando el historial.
-- La orden de servicio queda vinculada a su caso de garantía (y la garantía
-- muestra su orden). Aditiva, idempotente y re-ejecutable.
ALTER TABLE "ServiceOrder" ADD COLUMN IF NOT EXISTS "warrantyCaseId" TEXT;

CREATE INDEX IF NOT EXISTS "ServiceOrder_warrantyCaseId_idx" ON "ServiceOrder"("warrantyCaseId");

DO $$ BEGIN
  ALTER TABLE "ServiceOrder"
    ADD CONSTRAINT "ServiceOrder_warrantyCaseId_fkey"
    FOREIGN KEY ("warrantyCaseId") REFERENCES "WarrantyCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
