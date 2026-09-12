-- Aditiva: extiende trazabilidad financiera, compras y servicio sin mover ni
-- reinterpretar movimientos históricos.
ALTER TYPE "PaymentCurrency" ADD VALUE IF NOT EXISTS 'BRL';
ALTER TYPE "PaymentCurrency" ADD VALUE IF NOT EXISTS 'EUR';
ALTER TYPE "PaymentCurrency" ADD VALUE IF NOT EXISTS 'USDT';

CREATE TYPE "CashMovementKind" AS ENUM ('EXPENSE', 'TRANSFER', 'SUPPLIER_ADVANCE', 'CHEQUE', 'OWNER_WITHDRAWAL', 'ADJUSTMENT');
CREATE TYPE "CashDirection" AS ENUM ('IN', 'OUT');
CREATE TYPE "CashMovementStatus" AS ENUM ('PENDING', 'CLEARED', 'VOID');

CREATE TABLE "CashMovement" (
  "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "branchId" TEXT, "accountId" TEXT,
  "createdById" TEXT NOT NULL, "kind" "CashMovementKind" NOT NULL, "direction" "CashDirection" NOT NULL,
  "currency" "PaymentCurrency" NOT NULL DEFAULT 'PYG', "originalAmount" DECIMAL(18,2) NOT NULL,
  "exchangeRatePyg" DECIMAL(18,6) NOT NULL DEFAULT 1, "amountPyg" INTEGER NOT NULL,
  "counterparty" TEXT, "reference" TEXT, "description" TEXT NOT NULL, "status" "CashMovementStatus" NOT NULL DEFAULT 'PENDING',
  "dueAt" TIMESTAMP(3), "clearedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "CashMovement_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CashMovement_tenantId_branchId_createdAt_idx" ON "CashMovement"("tenantId", "branchId", "createdAt");
CREATE INDEX "CashMovement_tenantId_status_dueAt_idx" ON "CashMovement"("tenantId", "status", "dueAt");
CREATE INDEX "CashMovement_accountId_createdAt_idx" ON "CashMovement"("accountId", "createdAt");
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "PaymentAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PurchaseOrder" ADD COLUMN "insurancePyg" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PurchaseOrder" ADD COLUMN "taxesPyg" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PurchaseOrder" ADD COLUMN "otherCostsPyg" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PurchaseOrder" ADD COLUMN "currency" "PaymentCurrency" NOT NULL DEFAULT 'PYG';
ALTER TABLE "PurchaseOrder" ADD COLUMN "exchangeRatePyg" DECIMAL(18,6) NOT NULL DEFAULT 1;
ALTER TABLE "PurchaseOrder" ADD COLUMN "originalSubtotal" DECIMAL(18,2);
ALTER TABLE "PurchaseOrder" ADD COLUMN "dueAt" TIMESTAMP(3);
ALTER TABLE "PurchaseOrder" ADD COLUMN "supplierReference" TEXT;
CREATE TABLE "PurchasePayment" (
  "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "purchaseId" TEXT NOT NULL, "accountId" TEXT,
  "amountPyg" INTEGER NOT NULL, "currency" "PaymentCurrency" NOT NULL DEFAULT 'PYG', "originalAmount" DECIMAL(18,2) NOT NULL,
  "exchangeRatePyg" DECIMAL(18,6) NOT NULL DEFAULT 1, "reference" TEXT, "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PurchasePayment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PurchasePayment_tenantId_purchaseId_paidAt_idx" ON "PurchasePayment"("tenantId", "purchaseId", "paidAt");
ALTER TABLE "PurchasePayment" ADD CONSTRAINT "PurchasePayment_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PurchasePayment" ADD CONSTRAINT "PurchasePayment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "PaymentAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TradeInDevice" ADD COLUMN "diagnosis" TEXT;
ALTER TABLE "TradeInDevice" ADD COLUMN "technicianName" TEXT;
ALTER TABLE "TradeInDevice" ADD COLUMN "accessories" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "TradeInDevice" ADD COLUMN "photos" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "WarrantyCase" ADD COLUMN "diagnosis" TEXT;
ALTER TABLE "WarrantyCase" ADD COLUMN "technicianName" TEXT;
ALTER TABLE "WarrantyCase" ADD COLUMN "parts" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "WarrantyCase" ADD COLUMN "photos" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "WarrantyCase" ADD COLUMN "resolution" TEXT;
ALTER TABLE "WarrantyCase" ADD COLUMN "repairCostPyg" INTEGER NOT NULL DEFAULT 0;
