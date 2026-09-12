-- Serialized inventory and branch-to-branch transfers.
-- Products remain the sellable catalog rows; InventoryUnit is the immutable
-- per-device serial/IMEI record used whenever the item is individually tracked.

DROP INDEX "Product_tenantId_sku_key";
CREATE UNIQUE INDEX "Product_tenantId_branchId_sku_key" ON "Product"("tenantId", "branchId", "sku");

CREATE TYPE "InventoryUnitStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'SOLD', 'DEFECTIVE', 'IN_TRANSIT');

CREATE TABLE "InventoryUnit" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "branchId" TEXT,
  "serial" TEXT NOT NULL,
  "status" "InventoryUnitStatus" NOT NULL DEFAULT 'AVAILABLE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryUnit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InventoryUnit_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "InventoryUnit_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "InventoryUnit_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Existing single-IMEI products become tracked units. Normalising avoids two
-- spellings of the same IMEI being imported as independent devices.
INSERT INTO "InventoryUnit" ("id", "tenantId", "productId", "branchId", "serial", "status", "createdAt", "updatedAt")
SELECT 'legacy-unit-' || md5(random()::text || clock_timestamp()::text || p."id"), p."tenantId", p."id", p."branchId", upper(btrim(p."imei")), 'AVAILABLE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT ON ("tenantId", upper(btrim("imei"))) *
  FROM "Product"
  WHERE "imei" IS NOT NULL AND btrim("imei") <> ''
  ORDER BY "tenantId", upper(btrim("imei")), "createdAt"
) p;

CREATE UNIQUE INDEX "InventoryUnit_tenantId_serial_key" ON "InventoryUnit"("tenantId", "serial");
CREATE INDEX "InventoryUnit_tenantId_productId_status_idx" ON "InventoryUnit"("tenantId", "productId", "status");
CREATE INDEX "InventoryUnit_tenantId_branchId_status_idx" ON "InventoryUnit"("tenantId", "branchId", "status");

CREATE TABLE "StockTransfer" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "sourceBranchId" TEXT NOT NULL,
  "destinationBranchId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StockTransfer_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StockTransfer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StockTransfer_sourceBranchId_fkey" FOREIGN KEY ("sourceBranchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockTransfer_destinationBranchId_fkey" FOREIGN KEY ("destinationBranchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockTransfer_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockTransfer_different_branches" CHECK ("sourceBranchId" <> "destinationBranchId")
);

CREATE TABLE "StockTransferLine" (
  "id" TEXT NOT NULL,
  "transferId" TEXT NOT NULL,
  "sourceProductId" TEXT NOT NULL,
  "destinationProductId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "serials" JSONB NOT NULL DEFAULT '[]',
  CONSTRAINT "StockTransferLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StockTransferLine_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "StockTransfer"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StockTransferLine_sourceProductId_fkey" FOREIGN KEY ("sourceProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockTransferLine_destinationProductId_fkey" FOREIGN KEY ("destinationProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockTransferLine_quantity_positive" CHECK ("quantity" > 0)
);

CREATE INDEX "StockTransfer_tenantId_sourceBranchId_createdAt_idx" ON "StockTransfer"("tenantId", "sourceBranchId", "createdAt");
CREATE INDEX "StockTransfer_tenantId_destinationBranchId_createdAt_idx" ON "StockTransfer"("tenantId", "destinationBranchId", "createdAt");
CREATE INDEX "StockTransferLine_transferId_idx" ON "StockTransferLine"("transferId");
