-- Auditoría de efectivo (#161): marca de verificación por operación de caja.
-- Aditiva, idempotente y re-ejecutable: cada objeto se crea solo si no existe.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CashAuditStatus') THEN
    CREATE TYPE "CashAuditStatus" AS ENUM ('VERIFIED', 'PENDING', 'DIFFERENCE');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "CashAuditMark" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "operationKind" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "status" "CashAuditStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "auditedById" TEXT,
    "auditedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CashAuditMark_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CashAuditMark" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "CashAuditMark" ADD COLUMN IF NOT EXISTS "operationKind" TEXT;
ALTER TABLE "CashAuditMark" ADD COLUMN IF NOT EXISTS "operationId" TEXT;
ALTER TABLE "CashAuditMark" ADD COLUMN IF NOT EXISTS "status" "CashAuditStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "CashAuditMark" ADD COLUMN IF NOT EXISTS "note" TEXT;
ALTER TABLE "CashAuditMark" ADD COLUMN IF NOT EXISTS "auditedById" TEXT;
ALTER TABLE "CashAuditMark" ADD COLUMN IF NOT EXISTS "auditedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "CashAuditMark" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX IF NOT EXISTS "CashAuditMark_tenantId_operationKind_operationId_key" ON "CashAuditMark"("tenantId", "operationKind", "operationId");
CREATE INDEX IF NOT EXISTS "CashAuditMark_tenantId_status_idx" ON "CashAuditMark"("tenantId", "status");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CashAuditMark_tenantId_fkey') THEN
    ALTER TABLE "CashAuditMark" ADD CONSTRAINT "CashAuditMark_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CashAuditMark_auditedById_fkey') THEN
    ALTER TABLE "CashAuditMark" ADD CONSTRAINT "CashAuditMark_auditedById_fkey" FOREIGN KEY ("auditedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
