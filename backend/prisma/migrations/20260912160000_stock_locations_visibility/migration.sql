-- Ubicaciones internas por sucursal y visibilidad externa de disponibilidad.
-- Es una migración aditiva: no mueve ni mezcla el stock ya existente.
CREATE TABLE "StockLocation" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StockLocation_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "InventoryUnit" ADD COLUMN "locationId" TEXT;

CREATE TABLE "InventoryVisibilityGrant" (
  "id" TEXT NOT NULL,
  "providerTenantId" TEXT NOT NULL,
  "recipientTenantId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InventoryVisibilityGrant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StockLocation_branchId_name_key" ON "StockLocation"("branchId", "name");
CREATE UNIQUE INDEX "StockLocation_branchId_code_key" ON "StockLocation"("branchId", "code");
CREATE INDEX "StockLocation_tenantId_branchId_isActive_idx" ON "StockLocation"("tenantId", "branchId", "isActive");
CREATE INDEX "InventoryUnit_tenantId_branchId_locationId_status_idx" ON "InventoryUnit"("tenantId", "branchId", "locationId", "status");
CREATE UNIQUE INDEX "InventoryVisibilityGrant_providerTenantId_recipientTenantId_key" ON "InventoryVisibilityGrant"("providerTenantId", "recipientTenantId");
CREATE INDEX "InventoryVisibilityGrant_recipientTenantId_isActive_idx" ON "InventoryVisibilityGrant"("recipientTenantId", "isActive");
CREATE INDEX "InventoryVisibilityGrant_providerTenantId_isActive_idx" ON "InventoryVisibilityGrant"("providerTenantId", "isActive");

ALTER TABLE "StockLocation" ADD CONSTRAINT "StockLocation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockLocation" ADD CONSTRAINT "StockLocation_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryUnit" ADD CONSTRAINT "InventoryUnit_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "StockLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InventoryVisibilityGrant" ADD CONSTRAINT "InventoryVisibilityGrant_providerTenantId_fkey" FOREIGN KEY ("providerTenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryVisibilityGrant" ADD CONSTRAINT "InventoryVisibilityGrant_recipientTenantId_fkey" FOREIGN KEY ("recipientTenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
