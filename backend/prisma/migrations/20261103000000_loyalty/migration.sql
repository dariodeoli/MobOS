-- Fidelización (#114): puntos por venta medidos en guaraníes (1 punto = 1 Gs.),
-- canjeables como saldo a favor del cliente. Aditiva, idempotente y
-- re-ejecutable: cada objeto se crea solo si no existe.
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "loyaltyPct" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "loyaltyPointsPyg" INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LoyaltyMovementKind') THEN
    CREATE TYPE "LoyaltyMovementKind" AS ENUM ('ACCRUAL', 'REDEMPTION', 'ADJUSTMENT');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "LoyaltyMovement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "orderId" TEXT,
    "kind" "LoyaltyMovementKind" NOT NULL,
    "pointsPyg" INTEGER NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LoyaltyMovement_pkey" PRIMARY KEY ("id")
);

-- Un CREATE TABLE IF NOT EXISTS sobre una tabla ya creada es no-op y dejaría
-- columnas afuera: se completan por separado, sin tocar lo existente.
ALTER TABLE "LoyaltyMovement" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "LoyaltyMovement" ADD COLUMN IF NOT EXISTS "customerId" TEXT;
ALTER TABLE "LoyaltyMovement" ADD COLUMN IF NOT EXISTS "orderId" TEXT;
ALTER TABLE "LoyaltyMovement" ADD COLUMN IF NOT EXISTS "kind" "LoyaltyMovementKind";
ALTER TABLE "LoyaltyMovement" ADD COLUMN IF NOT EXISTS "pointsPyg" INTEGER;
ALTER TABLE "LoyaltyMovement" ADD COLUMN IF NOT EXISTS "note" TEXT;
ALTER TABLE "LoyaltyMovement" ADD COLUMN IF NOT EXISTS "createdById" TEXT;
ALTER TABLE "LoyaltyMovement" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS "LoyaltyMovement_tenantId_customerId_createdAt_idx" ON "LoyaltyMovement"("tenantId", "customerId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LoyaltyMovement_tenantId_fkey') THEN
    ALTER TABLE "LoyaltyMovement" ADD CONSTRAINT "LoyaltyMovement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LoyaltyMovement_customerId_fkey') THEN
    ALTER TABLE "LoyaltyMovement" ADD CONSTRAINT "LoyaltyMovement_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LoyaltyMovement_orderId_fkey') THEN
    ALTER TABLE "LoyaltyMovement" ADD CONSTRAINT "LoyaltyMovement_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
