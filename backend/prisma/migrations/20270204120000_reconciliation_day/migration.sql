-- CreateTable
CREATE TABLE IF NOT EXISTS "ReconciliationDay" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "businessDay" VARCHAR(10) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReconciliationDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ReconciliationDayRevision" (
    "id" TEXT NOT NULL,
    "dayId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "declarations" JSONB NOT NULL,
    "snapshot" JSONB NOT NULL,
    "paymentSnapshot" JSONB NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReconciliationDayRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ReconciliationDay_tenantId_branchId_businessDay_key" ON "ReconciliationDay"("tenantId", "branchId", "businessDay");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ReconciliationDayRevision_tenantId_requestId_key" ON "ReconciliationDayRevision"("tenantId", "requestId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ReconciliationDayRevision_dayId_version_key" ON "ReconciliationDayRevision"("dayId", "version");

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ReconciliationDay_tenantId_fkey' AND conrelid = '"ReconciliationDay"'::regclass) THEN
    ALTER TABLE "ReconciliationDay" ADD CONSTRAINT "ReconciliationDay_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ReconciliationDay_branchId_fkey' AND conrelid = '"ReconciliationDay"'::regclass) THEN
    ALTER TABLE "ReconciliationDay" ADD CONSTRAINT "ReconciliationDay_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ReconciliationDayRevision_dayId_fkey' AND conrelid = '"ReconciliationDayRevision"'::regclass) THEN
    ALTER TABLE "ReconciliationDayRevision" ADD CONSTRAINT "ReconciliationDayRevision_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "ReconciliationDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;


DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ReconciliationDay_businessDay_check' AND conrelid = '"ReconciliationDay"'::regclass) THEN
    ALTER TABLE "ReconciliationDay" ADD CONSTRAINT "ReconciliationDay_businessDay_check" CHECK ("businessDay" ~ '^\d{4}-\d{2}-\d{2}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ReconciliationDayRevision_payload_check' AND conrelid = '"ReconciliationDayRevision"'::regclass) THEN
    ALTER TABLE "ReconciliationDayRevision" ADD CONSTRAINT "ReconciliationDayRevision_payload_check" CHECK ("version" > 0 AND jsonb_typeof("declarations") = 'array' AND jsonb_typeof("snapshot") = 'object' AND jsonb_typeof("paymentSnapshot") = 'array');
  END IF;
END $$;
