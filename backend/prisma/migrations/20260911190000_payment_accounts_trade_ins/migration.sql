ALTER TYPE "PaymentMethod" ADD VALUE 'TRADE_IN';
CREATE TYPE "PaymentCurrency" AS ENUM ('PYG', 'USD');
CREATE TYPE "PaymentAccountKind" AS ENUM ('CASH', 'TRANSFER', 'CARD', 'TRADE_IN');
CREATE TYPE "ProductDestination" AS ENUM ('NORMAL', 'OFFER', 'WHOLESALE');
CREATE TYPE "TradeInStatus" AS ENUM ('RECEIVED', 'REVIEW', 'REPAIR', 'READY', 'STOCK', 'SOLD_EXTERNAL');

CREATE TABLE "PaymentAccount" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "name" TEXT NOT NULL,
  "bank" TEXT,
  "holder" TEXT,
  "accountNumber" TEXT,
  "currency" "PaymentCurrency" NOT NULL,
  "kind" "PaymentAccountKind" NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "feePercent" DECIMAL(5,2) NOT NULL DEFAULT 0 CHECK ("feePercent" >= 0 AND "feePercent" <= 100),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "PaymentAccount_tenantId_isActive_idx" ON "PaymentAccount"("tenantId", "isActive");

ALTER TABLE "Payment"
  ADD COLUMN "accountId" TEXT REFERENCES "PaymentAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD COLUMN "accountSnapshot" JSONB,
  ADD COLUMN "currency" "PaymentCurrency",
  ADD COLUMN "originalAmount" DECIMAL(18,2),
  ADD COLUMN "exchangeRatePyg" DECIMAL(18,6),
  ADD CONSTRAINT "Payment_account_snapshot_check" CHECK (
    "accountId" IS NULL OR ("accountSnapshot" IS NOT NULL AND "currency" IS NOT NULL
      AND "originalAmount" IS NOT NULL AND "originalAmount" > 0
      AND "exchangeRatePyg" IS NOT NULL AND "exchangeRatePyg" > 0)
  );
ALTER TABLE "Product" ADD COLUMN "destination" "ProductDestination" NOT NULL DEFAULT 'NORMAL';

CREATE TABLE "TradeInDevice" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "branchId" TEXT REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "orderId" TEXT NOT NULL REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "paymentId" TEXT NOT NULL REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "serial" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "conditionNotes" TEXT NOT NULL,
  "valuePyg" INTEGER NOT NULL CHECK ("valuePyg" > 0),
  "status" "TradeInStatus" NOT NULL DEFAULT 'RECEIVED',
  "repairCostPyg" INTEGER NOT NULL DEFAULT 0 CHECK ("repairCostPyg" >= 0),
  "notes" TEXT,
  "productId" TEXT REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TradeInDevice_stock_product_check" CHECK (("status" = 'STOCK') = ("productId" IS NOT NULL))
);
CREATE UNIQUE INDEX "TradeInDevice_paymentId_key" ON "TradeInDevice"("paymentId");
CREATE UNIQUE INDEX "TradeInDevice_productId_key" ON "TradeInDevice"("productId");
CREATE UNIQUE INDEX "TradeInDevice_tenantId_serial_key" ON "TradeInDevice"("tenantId", "serial");
CREATE INDEX "TradeInDevice_tenantId_branchId_status_idx" ON "TradeInDevice"("tenantId", "branchId", "status");
CREATE INDEX "TradeInDevice_orderId_idx" ON "TradeInDevice"("orderId");
