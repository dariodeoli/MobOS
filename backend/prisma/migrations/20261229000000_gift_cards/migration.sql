-- Gift cards reales (#280): emisión con código, saldo prepago, canje en pago,
-- historial por tarjeta y auditoría. Aditiva, idempotente y re-ejecutable.
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'GIFT_CARD';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'GiftCardStatus') THEN
    CREATE TYPE "GiftCardStatus" AS ENUM ('ACTIVE', 'CANCELLED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'GiftCardMovementKind') THEN
    CREATE TYPE "GiftCardMovementKind" AS ENUM ('ISSUE', 'REDEEM', 'CANCEL');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "GiftCard" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "codeLast4" TEXT NOT NULL,
    "customerId" TEXT,
    "amountPyg" BIGINT NOT NULL,
    "balancePyg" BIGINT NOT NULL,
    "status" "GiftCardStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3),
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GiftCard_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "GiftCardMovement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "giftCardId" TEXT NOT NULL,
    "kind" "GiftCardMovementKind" NOT NULL,
    "amountPyg" BIGINT NOT NULL,
    "balanceAfterPyg" BIGINT NOT NULL,
    "orderId" TEXT,
    "paymentId" TEXT,
    "accountId" TEXT,
    "accountSnapshot" JSONB,
    "userId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GiftCardMovement_pkey" PRIMARY KEY ("id")
);

-- La migración de montos a BigInt pudo haber creado estas tablas con columnas
-- integer (nunca pasó, pero el guardado es barato): se asegura el tipo final.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'GiftCard' AND column_name = 'amountPyg' AND data_type = 'integer') THEN
    ALTER TABLE "GiftCard" ALTER COLUMN "amountPyg" TYPE BIGINT;
    ALTER TABLE "GiftCard" ALTER COLUMN "balancePyg" TYPE BIGINT;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'GiftCardMovement' AND column_name = 'amountPyg' AND data_type = 'integer') THEN
    ALTER TABLE "GiftCardMovement" ALTER COLUMN "amountPyg" TYPE BIGINT;
    ALTER TABLE "GiftCardMovement" ALTER COLUMN "balanceAfterPyg" TYPE BIGINT;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "GiftCard_tenantId_codeHash_key" ON "GiftCard"("tenantId", "codeHash");
CREATE INDEX IF NOT EXISTS "GiftCard_tenantId_createdAt_idx" ON "GiftCard"("tenantId", "createdAt");
CREATE INDEX IF NOT EXISTS "GiftCard_tenantId_customerId_idx" ON "GiftCard"("tenantId", "customerId");
CREATE UNIQUE INDEX IF NOT EXISTS "GiftCardMovement_paymentId_key" ON "GiftCardMovement"("paymentId");
CREATE INDEX IF NOT EXISTS "GiftCardMovement_tenantId_giftCardId_createdAt_idx" ON "GiftCardMovement"("tenantId", "giftCardId", "createdAt");
CREATE INDEX IF NOT EXISTS "GiftCardMovement_tenantId_orderId_idx" ON "GiftCardMovement"("tenantId", "orderId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'GiftCard_tenantId_fkey') THEN
    ALTER TABLE "GiftCard" ADD CONSTRAINT "GiftCard_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'GiftCard_customerId_fkey') THEN
    ALTER TABLE "GiftCard" ADD CONSTRAINT "GiftCard_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'GiftCardMovement_tenantId_fkey') THEN
    ALTER TABLE "GiftCardMovement" ADD CONSTRAINT "GiftCardMovement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'GiftCardMovement_giftCardId_fkey') THEN
    ALTER TABLE "GiftCardMovement" ADD CONSTRAINT "GiftCardMovement_giftCardId_fkey" FOREIGN KEY ("giftCardId") REFERENCES "GiftCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'GiftCardMovement_orderId_fkey') THEN
    ALTER TABLE "GiftCardMovement" ADD CONSTRAINT "GiftCardMovement_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'GiftCardMovement_paymentId_fkey') THEN
    ALTER TABLE "GiftCardMovement" ADD CONSTRAINT "GiftCardMovement_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
