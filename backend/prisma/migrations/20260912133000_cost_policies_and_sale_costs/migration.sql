ALTER TABLE "Product" ADD COLUMN "insuranceRate" DECIMAL(5,2);
ALTER TABLE "OrderItem"
  ADD COLUMN "baseUnitCostPyg" INTEGER,
  ADD COLUMN "insurancePyg" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "extraCostPyg" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "soldWithoutInsurance" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "CostPolicy" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "insuranceRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CostPolicy_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CostPolicy_tenantId_category_key" ON "CostPolicy"("tenantId", "category");
CREATE INDEX "CostPolicy_tenantId_isActive_idx" ON "CostPolicy"("tenantId", "isActive");
ALTER TABLE "CostPolicy" ADD CONSTRAINT "CostPolicy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
