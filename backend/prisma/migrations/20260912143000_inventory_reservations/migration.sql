ALTER TABLE "InventoryUnit"
  ADD COLUMN "reservedUntil" TIMESTAMP(3),
  ADD COLUMN "reservationCustomer" TEXT,
  ADD COLUMN "reservedById" TEXT;
CREATE INDEX "InventoryUnit_tenantId_status_reservedUntil_idx" ON "InventoryUnit"("tenantId", "status", "reservedUntil");
