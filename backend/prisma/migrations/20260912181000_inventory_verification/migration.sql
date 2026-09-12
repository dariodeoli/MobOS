ALTER TABLE "InventoryUnit" ADD COLUMN "lastVerifiedAt" TIMESTAMP(3);
ALTER TABLE "InventoryUnit" ADD COLUMN "lastVerifiedById" TEXT;
ALTER TABLE "InventoryUnit" ADD COLUMN "verificationCount" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "InventoryUnit_tenantId_branchId_lastVerifiedAt_idx" ON "InventoryUnit"("tenantId", "branchId", "lastVerifiedAt");
