-- Cobro del POS (#399), aditiva: «Paga al recibir», datos de encomienda y
-- cliente bloqueado. Sin DROP COLUMN.
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "paymentOnDelivery" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "shippingCarrier" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "shippingBranch" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "shippingAddressId" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "shippingAddress" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "blocked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "blockedReason" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "blockedAt" TIMESTAMP(3);
