-- Honorarios independientes de cobros y ventas. Sin tarifas precargadas.
-- CreateTable
CREATE TABLE IF NOT EXISTS "DeliveryTariff" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "validFrom" DATE NOT NULL,
    "validUntil" DATE NOT NULL,
    "tiers" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryTariff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "DeliveryTrip" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "orderId" TEXT,
    "tariffId" TEXT NOT NULL,
    "tariffSnapshot" JSONB NOT NULL,
    "route" TEXT NOT NULL,
    "distanceMeters" INTEGER NOT NULL,
    "tripsCount" INTEGER NOT NULL,
    "feePerTripPyg" BIGINT NOT NULL,
    "totalFeePyg" BIGINT NOT NULL,
    "performedOn" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "resolutionNote" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "weeklyCloseId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryTrip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "DeliveryWeeklyClose" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "feesPyg" BIGINT NOT NULL,
    "collectedPyg" BIGINT NOT NULL,
    "renderedPyg" BIGINT NOT NULL,
    "balanceAtClosePyg" BIGINT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryWeeklyClose_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "DeliveryWeeklyAdjustment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "weeklyCloseId" TEXT NOT NULL,
    "deltaPyg" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryWeeklyAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DeliveryTariff_tenantId_isActive_validFrom_idx" ON "DeliveryTariff"("tenantId", "isActive", "validFrom");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DeliveryTrip_tenantId_branchId_driverId_performedOn_idx" ON "DeliveryTrip"("tenantId", "branchId", "driverId", "performedOn");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DeliveryTrip_tenantId_orderId_status_idx" ON "DeliveryTrip"("tenantId", "orderId", "status");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "DeliveryTrip_tenantId_idempotencyKey_key" ON "DeliveryTrip"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DeliveryWeeklyClose_tenantId_weekStart_idx" ON "DeliveryWeeklyClose"("tenantId", "weekStart");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "DeliveryWeeklyClose_tenantId_branchId_driverId_weekStart_key" ON "DeliveryWeeklyClose"("tenantId", "branchId", "driverId", "weekStart");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DeliveryWeeklyAdjustment_weeklyCloseId_createdAt_idx" ON "DeliveryWeeklyAdjustment"("weeklyCloseId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "DeliveryWeeklyAdjustment_tenantId_idempotencyKey_key" ON "DeliveryWeeklyAdjustment"("tenantId", "idempotencyKey");

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DeliveryTariff_tenantId_fkey' AND conrelid = '"DeliveryTariff"'::regclass) THEN
    ALTER TABLE "DeliveryTariff" ADD CONSTRAINT "DeliveryTariff_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DeliveryTariff_createdById_fkey' AND conrelid = '"DeliveryTariff"'::regclass) THEN
    ALTER TABLE "DeliveryTariff" ADD CONSTRAINT "DeliveryTariff_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DeliveryTrip_tenantId_fkey' AND conrelid = '"DeliveryTrip"'::regclass) THEN
    ALTER TABLE "DeliveryTrip" ADD CONSTRAINT "DeliveryTrip_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DeliveryTrip_branchId_fkey' AND conrelid = '"DeliveryTrip"'::regclass) THEN
    ALTER TABLE "DeliveryTrip" ADD CONSTRAINT "DeliveryTrip_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DeliveryTrip_driverId_fkey' AND conrelid = '"DeliveryTrip"'::regclass) THEN
    ALTER TABLE "DeliveryTrip" ADD CONSTRAINT "DeliveryTrip_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DeliveryTrip_orderId_fkey' AND conrelid = '"DeliveryTrip"'::regclass) THEN
    ALTER TABLE "DeliveryTrip" ADD CONSTRAINT "DeliveryTrip_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DeliveryTrip_tariffId_fkey' AND conrelid = '"DeliveryTrip"'::regclass) THEN
    ALTER TABLE "DeliveryTrip" ADD CONSTRAINT "DeliveryTrip_tariffId_fkey" FOREIGN KEY ("tariffId") REFERENCES "DeliveryTariff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DeliveryTrip_resolvedById_fkey' AND conrelid = '"DeliveryTrip"'::regclass) THEN
    ALTER TABLE "DeliveryTrip" ADD CONSTRAINT "DeliveryTrip_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DeliveryTrip_weeklyCloseId_fkey' AND conrelid = '"DeliveryTrip"'::regclass) THEN
    ALTER TABLE "DeliveryTrip" ADD CONSTRAINT "DeliveryTrip_weeklyCloseId_fkey" FOREIGN KEY ("weeklyCloseId") REFERENCES "DeliveryWeeklyClose"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DeliveryTrip_createdById_fkey' AND conrelid = '"DeliveryTrip"'::regclass) THEN
    ALTER TABLE "DeliveryTrip" ADD CONSTRAINT "DeliveryTrip_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DeliveryWeeklyClose_tenantId_fkey' AND conrelid = '"DeliveryWeeklyClose"'::regclass) THEN
    ALTER TABLE "DeliveryWeeklyClose" ADD CONSTRAINT "DeliveryWeeklyClose_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DeliveryWeeklyClose_branchId_fkey' AND conrelid = '"DeliveryWeeklyClose"'::regclass) THEN
    ALTER TABLE "DeliveryWeeklyClose" ADD CONSTRAINT "DeliveryWeeklyClose_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DeliveryWeeklyClose_driverId_fkey' AND conrelid = '"DeliveryWeeklyClose"'::regclass) THEN
    ALTER TABLE "DeliveryWeeklyClose" ADD CONSTRAINT "DeliveryWeeklyClose_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DeliveryWeeklyClose_createdById_fkey' AND conrelid = '"DeliveryWeeklyClose"'::regclass) THEN
    ALTER TABLE "DeliveryWeeklyClose" ADD CONSTRAINT "DeliveryWeeklyClose_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DeliveryWeeklyAdjustment_tenantId_fkey' AND conrelid = '"DeliveryWeeklyAdjustment"'::regclass) THEN
    ALTER TABLE "DeliveryWeeklyAdjustment" ADD CONSTRAINT "DeliveryWeeklyAdjustment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DeliveryWeeklyAdjustment_weeklyCloseId_fkey' AND conrelid = '"DeliveryWeeklyAdjustment"'::regclass) THEN
    ALTER TABLE "DeliveryWeeklyAdjustment" ADD CONSTRAINT "DeliveryWeeklyAdjustment_weeklyCloseId_fkey" FOREIGN KEY ("weeklyCloseId") REFERENCES "DeliveryWeeklyClose"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DeliveryWeeklyAdjustment_createdById_fkey' AND conrelid = '"DeliveryWeeklyAdjustment"'::regclass) THEN
    ALTER TABLE "DeliveryWeeklyAdjustment" ADD CONSTRAINT "DeliveryWeeklyAdjustment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;


DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DeliveryTariff_dates_check' AND conrelid = '"DeliveryTariff"'::regclass) THEN
    ALTER TABLE "DeliveryTariff" ADD CONSTRAINT "DeliveryTariff_dates_check" CHECK ("validUntil" >= "validFrom");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DeliveryTrip_values_check' AND conrelid = '"DeliveryTrip"'::regclass) THEN
    ALTER TABLE "DeliveryTrip" ADD CONSTRAINT "DeliveryTrip_values_check" CHECK ("distanceMeters" BETWEEN 1 AND 28000 AND "tripsCount" BETWEEN 1 AND 100 AND "feePerTripPyg" >= 0 AND "totalFeePyg" = "feePerTripPyg" * "tripsCount" AND "status" IN ('COMPLETED', 'CANCELLED'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DeliveryWeeklyClose_values_check' AND conrelid = '"DeliveryWeeklyClose"'::regclass) THEN
    ALTER TABLE "DeliveryWeeklyClose" ADD CONSTRAINT "DeliveryWeeklyClose_values_check" CHECK ("feesPyg" >= 0 AND "collectedPyg" >= 0 AND "renderedPyg" >= 0 AND "renderedPyg" <= "collectedPyg");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DeliveryWeeklyAdjustment_delta_check' AND conrelid = '"DeliveryWeeklyAdjustment"'::regclass) THEN
    ALTER TABLE "DeliveryWeeklyAdjustment" ADD CONSTRAINT "DeliveryWeeklyAdjustment_delta_check" CHECK ("deltaPyg" <> 0);
  END IF;
END $$;
