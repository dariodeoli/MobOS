-- Liquidación de comisiones por vendedor y período, con comprobante verificable
-- por token. Migración aditiva, idempotente y re-ejecutable: cada objeto se
-- crea solo si no existe, incluso si otra migración creó la tabla antes.
CREATE TABLE IF NOT EXISTS "CommissionSettlement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "periodFrom" TEXT NOT NULL,
    "periodTo" TEXT NOT NULL,
    "totalPyg" INTEGER NOT NULL,
    "marginPyg" INTEGER NOT NULL DEFAULT 0,
    "commissionPct" DECIMAL(5,2),
    "linesJson" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "verificationToken" TEXT NOT NULL,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3),
    "paidById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CommissionSettlement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CommissionSettlement_verificationToken_key" ON "CommissionSettlement"("verificationToken");
CREATE INDEX IF NOT EXISTS "CommissionSettlement_tenantId_sellerId_periodFrom_idx" ON "CommissionSettlement"("tenantId", "sellerId", "periodFrom");
CREATE INDEX IF NOT EXISTS "CommissionSettlement_tenantId_status_createdAt_idx" ON "CommissionSettlement"("tenantId", "status", "createdAt");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CommissionSettlement_tenantId_fkey') THEN
    ALTER TABLE "CommissionSettlement" ADD CONSTRAINT "CommissionSettlement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CommissionSettlement_sellerId_fkey') THEN
    ALTER TABLE "CommissionSettlement" ADD CONSTRAINT "CommissionSettlement_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CommissionSettlement_createdById_fkey') THEN
    ALTER TABLE "CommissionSettlement" ADD CONSTRAINT "CommissionSettlement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CommissionSettlement_paidById_fkey') THEN
    ALTER TABLE "CommissionSettlement" ADD CONSTRAINT "CommissionSettlement_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
