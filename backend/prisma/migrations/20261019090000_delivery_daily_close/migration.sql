CREATE TABLE IF NOT EXISTS "DeliveryDailyClose" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "driverId" TEXT NOT NULL,
  "businessDay" DATE NOT NULL,
  "feesPyg" BIGINT NOT NULL,
  "collectedPyg" BIGINT NOT NULL,
  "renderedPyg" BIGINT NOT NULL,
  "balanceAtClosePyg" BIGINT NOT NULL,
  "snapshot" JSONB NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeliveryDailyClose_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "DeliveryTrip" ADD COLUMN IF NOT EXISTS "dailyCloseId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "DeliveryDailyClose_tenantId_branchId_driverId_businessDay_key" ON "DeliveryDailyClose"("tenantId", "branchId", "driverId", "businessDay");
CREATE INDEX IF NOT EXISTS "DeliveryDailyClose_tenantId_businessDay_idx" ON "DeliveryDailyClose"("tenantId", "businessDay");
CREATE INDEX IF NOT EXISTS "DeliveryTrip_tenantId_branchId_driverId_performedOn_dailyCloseId_idx" ON "DeliveryTrip"("tenantId", "branchId", "driverId", "performedOn", "dailyCloseId");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DeliveryDailyClose_tenantId_fkey') THEN
    ALTER TABLE "DeliveryDailyClose" ADD CONSTRAINT "DeliveryDailyClose_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DeliveryDailyClose_branchId_fkey') THEN
    ALTER TABLE "DeliveryDailyClose" ADD CONSTRAINT "DeliveryDailyClose_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DeliveryDailyClose_driverId_fkey') THEN
    ALTER TABLE "DeliveryDailyClose" ADD CONSTRAINT "DeliveryDailyClose_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DeliveryDailyClose_createdById_fkey') THEN
    ALTER TABLE "DeliveryDailyClose" ADD CONSTRAINT "DeliveryDailyClose_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DeliveryTrip_dailyCloseId_fkey') THEN
    ALTER TABLE "DeliveryTrip" ADD CONSTRAINT "DeliveryTrip_dailyCloseId_fkey" FOREIGN KEY ("dailyCloseId") REFERENCES "DeliveryDailyClose"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
