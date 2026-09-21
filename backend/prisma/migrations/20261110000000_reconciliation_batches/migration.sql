-- Conciliación en lote (#144): un depósito/transferencia recibido contra los
-- pagos que debería cubrir. Aditiva, idempotente y re-ejecutable: cada objeto
-- se crea solo si no existe.

CREATE TABLE IF NOT EXISTS "ReconciliationBatch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "accountId" TEXT,
    "from" TIMESTAMP(3) NOT NULL,
    "to" TIMESTAMP(3) NOT NULL,
    "expectedPyg" INTEGER NOT NULL,
    "receivedPyg" INTEGER NOT NULL,
    "differencePyg" INTEGER NOT NULL,
    "state" "ReconciliationState" NOT NULL DEFAULT 'VERIFIED',
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ReconciliationBatch_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ReconciliationBatch" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "ReconciliationBatch" ADD COLUMN IF NOT EXISTS "branchId" TEXT;
ALTER TABLE "ReconciliationBatch" ADD COLUMN IF NOT EXISTS "accountId" TEXT;
ALTER TABLE "ReconciliationBatch" ADD COLUMN IF NOT EXISTS "from" TIMESTAMP(3);
ALTER TABLE "ReconciliationBatch" ADD COLUMN IF NOT EXISTS "to" TIMESTAMP(3);
ALTER TABLE "ReconciliationBatch" ADD COLUMN IF NOT EXISTS "expectedPyg" INTEGER;
ALTER TABLE "ReconciliationBatch" ADD COLUMN IF NOT EXISTS "receivedPyg" INTEGER;
ALTER TABLE "ReconciliationBatch" ADD COLUMN IF NOT EXISTS "differencePyg" INTEGER;
ALTER TABLE "ReconciliationBatch" ADD COLUMN IF NOT EXISTS "state" "ReconciliationState" NOT NULL DEFAULT 'VERIFIED';
ALTER TABLE "ReconciliationBatch" ADD COLUMN IF NOT EXISTS "note" TEXT;
ALTER TABLE "ReconciliationBatch" ADD COLUMN IF NOT EXISTS "createdById" TEXT;
ALTER TABLE "ReconciliationBatch" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "ReconciliationBatch" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS "ReconciliationBatch_tenantId_createdAt_idx" ON "ReconciliationBatch"("tenantId", "createdAt");
CREATE INDEX IF NOT EXISTS "ReconciliationBatch_accountId_createdAt_idx" ON "ReconciliationBatch"("accountId", "createdAt");
CREATE INDEX IF NOT EXISTS "ReconciliationBatch_tenantId_branchId_createdAt_idx" ON "ReconciliationBatch"("tenantId", "branchId", "createdAt");

-- Enlace pago → lote (null = conciliación individual, como hasta ahora).
ALTER TABLE "PaymentReconciliation" ADD COLUMN IF NOT EXISTS "batchId" TEXT;
CREATE INDEX IF NOT EXISTS "PaymentReconciliation_batchId_idx" ON "PaymentReconciliation"("batchId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ReconciliationBatch_tenantId_fkey') THEN
    ALTER TABLE "ReconciliationBatch" ADD CONSTRAINT "ReconciliationBatch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ReconciliationBatch_accountId_fkey') THEN
    ALTER TABLE "ReconciliationBatch" ADD CONSTRAINT "ReconciliationBatch_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "PaymentAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ReconciliationBatch_createdById_fkey') THEN
    ALTER TABLE "ReconciliationBatch" ADD CONSTRAINT "ReconciliationBatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PaymentReconciliation_batchId_fkey') THEN
    ALTER TABLE "PaymentReconciliation" ADD CONSTRAINT "PaymentReconciliation_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ReconciliationBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
