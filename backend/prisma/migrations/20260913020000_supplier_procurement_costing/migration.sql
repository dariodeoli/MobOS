-- Proveedores, crédito/anticipos y costo final inmutable por línea/lote.
CREATE TYPE "PurchaseCostAllocationMethod" AS ENUM ('PROPORTIONAL_VALUE', 'PROPORTIONAL_QUANTITY');
CREATE TYPE "PurchasePaymentKind" AS ENUM ('ADVANCE', 'SETTLEMENT');

CREATE TABLE "Supplier" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "document" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "notes" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Supplier_tenantId_name_key" ON "Supplier"("tenantId", "name");
CREATE INDEX "Supplier_tenantId_isActive_name_idx" ON "Supplier"("tenantId", "isActive", "name");
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PurchaseOrder" ADD COLUMN "supplierId" TEXT;
ALTER TABLE "PurchaseOrder" ADD COLUMN "creditEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PurchaseOrder" ADD COLUMN "costAllocationMethod" "PurchaseCostAllocationMethod" NOT NULL DEFAULT 'PROPORTIONAL_VALUE';
CREATE INDEX "PurchaseOrder_tenantId_supplierId_createdAt_idx" ON "PurchaseOrder"("tenantId", "supplierId", "createdAt");
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PurchaseLine" ADD COLUMN "lotReference" TEXT;
ALTER TABLE "PurchaseLine" ADD COLUMN "baseTotalPyg" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PurchaseLine" ADD COLUMN "allocatedShippingPyg" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PurchaseLine" ADD COLUMN "allocatedCustomsPyg" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PurchaseLine" ADD COLUMN "allocatedInsurancePyg" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PurchaseLine" ADD COLUMN "allocatedTaxesPyg" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PurchaseLine" ADD COLUMN "allocatedOtherCostsPyg" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PurchaseLine" ADD COLUMN "allocatedExtraCostPyg" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PurchaseLine" ADD COLUMN "finalTotalCostPyg" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PurchaseLine" ADD COLUMN "finalUnitCostPyg" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PurchasePayment" ADD COLUMN "kind" "PurchasePaymentKind" NOT NULL DEFAULT 'SETTLEMENT';

-- Compras históricas: su costo base conocido queda trazado sin inventar gastos.
UPDATE "PurchaseLine" SET
  "baseTotalPyg" = "quantity" * "unitCostPyg",
  "finalTotalCostPyg" = "quantity" * "unitCostPyg",
  "finalUnitCostPyg" = "unitCostPyg"
WHERE "baseTotalPyg" = 0 AND "finalTotalCostPyg" = 0;
