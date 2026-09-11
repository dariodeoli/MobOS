CREATE TYPE "WarrantyStatus" AS ENUM ('RECEIVED', 'DIAGNOSIS', 'READY', 'DELIVERED');

CREATE TABLE "WarrantyCase" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "orderItemId" TEXT,
  "customerName" TEXT NOT NULL,
  "serial" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "status" "WarrantyStatus" NOT NULL DEFAULT 'RECEIVED',
  "responsibleName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  CONSTRAINT "WarrantyCase_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WarrantyCase_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WarrantyCase_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "WarrantyCase_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "WarrantyCase_tenantId_createdAt_idx" ON "WarrantyCase"("tenantId", "createdAt");
CREATE INDEX "WarrantyCase_tenantId_serial_idx" ON "WarrantyCase"("tenantId", "serial");
CREATE INDEX "WarrantyCase_tenantId_branchId_idx" ON "WarrantyCase"("tenantId", "branchId");
CREATE INDEX "WarrantyCase_tenantId_status_idx" ON "WarrantyCase"("tenantId", "status");
