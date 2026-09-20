-- Conteo de inventario auditable: documento, líneas escaneadas y aprobación.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'InventoryCountStatus') THEN
    CREATE TYPE "InventoryCountStatus" AS ENUM ('DRAFT', 'APPLIED', 'CANCELLED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "InventoryCount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "status" "InventoryCountStatus" NOT NULL DEFAULT 'DRAFT',
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "appliedById" TEXT,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InventoryCount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "InventoryCountLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "countId" TEXT NOT NULL,
    "productId" TEXT,
    "serial" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "expected" BOOLEAN NOT NULL DEFAULT false,
    "scannedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryCountLine_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "InventoryCount_tenantId_branchId_status_idx" ON "InventoryCount"("tenantId", "branchId", "status");
CREATE INDEX IF NOT EXISTS "InventoryCount_tenantId_createdAt_idx" ON "InventoryCount"("tenantId", "createdAt");
CREATE INDEX IF NOT EXISTS "InventoryCountLine_countId_idx" ON "InventoryCountLine"("countId");
CREATE UNIQUE INDEX IF NOT EXISTS "InventoryCountLine_countId_serial_key" ON "InventoryCountLine"("countId", "serial");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InventoryCount_tenantId_fkey') THEN
    ALTER TABLE "InventoryCount" ADD CONSTRAINT "InventoryCount_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InventoryCount_branchId_fkey') THEN
    ALTER TABLE "InventoryCount" ADD CONSTRAINT "InventoryCount_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InventoryCountLine_tenantId_fkey') THEN
    ALTER TABLE "InventoryCountLine" ADD CONSTRAINT "InventoryCountLine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InventoryCountLine_countId_fkey') THEN
    ALTER TABLE "InventoryCountLine" ADD CONSTRAINT "InventoryCountLine_countId_fkey" FOREIGN KEY ("countId") REFERENCES "InventoryCount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InventoryCountLine_productId_fkey') THEN
    ALTER TABLE "InventoryCountLine" ADD CONSTRAINT "InventoryCountLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
