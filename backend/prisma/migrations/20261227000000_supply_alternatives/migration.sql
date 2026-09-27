-- A5 (#279) · Variante agotada → alternativas: versiones propuestas por el
-- comprador, decisión del vendedor y aprobación del cliente (OTP si cambia el
-- precio). Aditiva e idempotente.
CREATE TABLE IF NOT EXISTS "SupplyAlternative" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "supplyNeedId" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "status" TEXT NOT NULL DEFAULT 'PROPUESTA',
  "reason" TEXT,
  "optionSummary" TEXT NOT NULL,
  "productId" TEXT,
  "priceDeltaPyg" INTEGER NOT NULL DEFAULT 0,
  "newEta" TIMESTAMP(3),
  "notes" TEXT,
  "proposedById" TEXT,
  "decidedById" TEXT,
  "decidedAt" TIMESTAMP(3),
  "customerApprovedAt" TIMESTAMP(3),
  "customerRejectedAt" TIMESTAMP(3),
  "publicTokenHash" TEXT,
  "otpCodeHash" TEXT,
  "otpExpiresAt" TIMESTAMP(3),
  "otpAttempts" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupplyAlternative_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SupplyAlternative_supplyNeedId_version_key" ON "SupplyAlternative"("supplyNeedId", "version");
CREATE UNIQUE INDEX IF NOT EXISTS "SupplyAlternative_publicTokenHash_key" ON "SupplyAlternative"("publicTokenHash");
CREATE INDEX IF NOT EXISTS "SupplyAlternative_tenantId_status_idx" ON "SupplyAlternative"("tenantId", "status");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SupplyAlternative_tenantId_fkey') THEN
    ALTER TABLE "SupplyAlternative" ADD CONSTRAINT "SupplyAlternative_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SupplyAlternative_supplyNeedId_fkey') THEN
    ALTER TABLE "SupplyAlternative" ADD CONSTRAINT "SupplyAlternative_supplyNeedId_fkey" FOREIGN KEY ("supplyNeedId") REFERENCES "SupplyNeed"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
