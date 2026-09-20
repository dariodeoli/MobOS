-- Saldo a favor del cliente (nota de crédito interna): devolución sin
-- reembolso en efectivo o crédito manual de gerencia.
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'STORE_CREDIT';

CREATE TABLE IF NOT EXISTS "StoreCredit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "orderId" TEXT,
    "amountPyg" INTEGER NOT NULL,
    "remainingPyg" INTEGER NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StoreCredit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "StoreCreditUse" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "creditId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "paymentId" TEXT,
    "amountPyg" INTEGER NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoreCreditUse_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "StoreCredit_tenantId_customerId_idx" ON "StoreCredit"("tenantId", "customerId");
CREATE INDEX IF NOT EXISTS "StoreCredit_tenantId_remainingPyg_idx" ON "StoreCredit"("tenantId", "remainingPyg");
CREATE INDEX IF NOT EXISTS "StoreCreditUse_tenantId_orderId_idx" ON "StoreCreditUse"("tenantId", "orderId");
CREATE UNIQUE INDEX IF NOT EXISTS "StoreCreditUse_paymentId_key" ON "StoreCreditUse"("paymentId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StoreCredit_tenantId_fkey') THEN
    ALTER TABLE "StoreCredit" ADD CONSTRAINT "StoreCredit_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StoreCredit_customerId_fkey') THEN
    ALTER TABLE "StoreCredit" ADD CONSTRAINT "StoreCredit_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StoreCredit_orderId_fkey') THEN
    ALTER TABLE "StoreCredit" ADD CONSTRAINT "StoreCredit_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StoreCreditUse_tenantId_fkey') THEN
    ALTER TABLE "StoreCreditUse" ADD CONSTRAINT "StoreCreditUse_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StoreCreditUse_creditId_fkey') THEN
    ALTER TABLE "StoreCreditUse" ADD CONSTRAINT "StoreCreditUse_creditId_fkey" FOREIGN KEY ("creditId") REFERENCES "StoreCredit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StoreCreditUse_orderId_fkey') THEN
    ALTER TABLE "StoreCreditUse" ADD CONSTRAINT "StoreCreditUse_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StoreCreditUse_paymentId_fkey') THEN
    ALTER TABLE "StoreCreditUse" ADD CONSTRAINT "StoreCreditUse_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
