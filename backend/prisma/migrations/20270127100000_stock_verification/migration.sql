-- Verificación física de stock por escaneo: sesiones por sucursal/depósito. Aditiva y re-ejecutable.
CREATE TABLE IF NOT EXISTS "StockVerification" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "locationId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "note" TEXT,
  "startedById" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedById" TEXT,
  "finishedAt" TIMESTAMP(3),
  "expectedCount" INTEGER NOT NULL DEFAULT 0,
  "verifiedCount" INTEGER NOT NULL DEFAULT 0,
  "missingCount" INTEGER NOT NULL DEFAULT 0,
  "unexpectedCount" INTEGER NOT NULL DEFAULT 0,
  "missingSerials" JSONB,
  CONSTRAINT "StockVerification_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "StockVerificationScan" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "verificationId" TEXT NOT NULL,
  "serial" TEXT NOT NULL,
  "unitId" TEXT,
  "outcome" TEXT NOT NULL,
  "reason" TEXT,
  "productName" TEXT,
  "scannedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StockVerificationScan_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "StockVerification_tenantId_branchId_status_idx" ON "StockVerification"("tenantId", "branchId", "status");
CREATE INDEX IF NOT EXISTS "StockVerification_tenantId_startedAt_idx" ON "StockVerification"("tenantId", "startedAt");
CREATE INDEX IF NOT EXISTS "StockVerificationScan_tenantId_verificationId_idx" ON "StockVerificationScan"("tenantId", "verificationId");
CREATE UNIQUE INDEX IF NOT EXISTS "StockVerificationScan_verificationId_serial_key" ON "StockVerificationScan"("verificationId", "serial");
DO $$ BEGIN
  ALTER TABLE "StockVerification" ADD CONSTRAINT "StockVerification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "StockVerificationScan" ADD CONSTRAINT "StockVerificationScan_verificationId_fkey" FOREIGN KEY ("verificationId") REFERENCES "StockVerification"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
