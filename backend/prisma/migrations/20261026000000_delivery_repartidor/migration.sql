-- Delivery propio: rol de repartidor, asignación de pedidos, pre-cobro en la
-- calle y rendición en la tienda.
-- Aditiva, idempotente y re-ejecutable: cada objeto se crea solo si falta.

-- 1. Rol nuevo. `ADD VALUE` no se puede usar en la misma transacción que lo
--    inserta, y esta migración solo lo declara.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'REPARTIDOR';

-- 2. Estado de la rendición.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DeliverySettlementStatus') THEN
    CREATE TYPE "DeliverySettlementStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');
  END IF;
END $$;

-- 3. Pedido asignado a un repartidor.
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "assignedToId" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "assignedAt" TIMESTAMP(3);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Order_assignedToId_fkey') THEN
    ALTER TABLE "Order" ADD CONSTRAINT "Order_assignedToId_fkey"
      FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "Order_assignedToId_idx" ON "Order"("assignedToId");
CREATE INDEX IF NOT EXISTS "Order_tenantId_assignedToId_fulfillmentStatus_idx"
  ON "Order"("tenantId", "assignedToId", "fulfillmentStatus");

-- 4. Pre-cobro del reparto sobre el pago.
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "deliveryUserId" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "collectedAt" TIMESTAMP(3);
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "deliverySettlementId" TEXT;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Payment_deliveryUserId_fkey') THEN
    ALTER TABLE "Payment" ADD CONSTRAINT "Payment_deliveryUserId_fkey"
      FOREIGN KEY ("deliveryUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 5. Rendición.
CREATE TABLE IF NOT EXISTS "DeliverySettlement" (
  "id"               TEXT NOT NULL,
  "tenantId"         TEXT NOT NULL,
  "branchId"         TEXT,
  "deliveryUserId"   TEXT NOT NULL,
  "totalPyg"         INTEGER NOT NULL,
  "pendingPyg"       INTEGER NOT NULL DEFAULT 0,
  "ordersCount"      INTEGER NOT NULL DEFAULT 0,
  "note"             TEXT,
  "status"           "DeliverySettlementStatus" NOT NULL DEFAULT 'PENDING',
  "verifiedById"     TEXT,
  "verifiedAt"       TIMESTAMP(3),
  "verificationNote" TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DeliverySettlement_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DeliverySettlement_tenantId_fkey') THEN
    ALTER TABLE "DeliverySettlement" ADD CONSTRAINT "DeliverySettlement_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DeliverySettlement_branchId_fkey') THEN
    ALTER TABLE "DeliverySettlement" ADD CONSTRAINT "DeliverySettlement_branchId_fkey"
      FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DeliverySettlement_deliveryUserId_fkey') THEN
    ALTER TABLE "DeliverySettlement" ADD CONSTRAINT "DeliverySettlement_deliveryUserId_fkey"
      FOREIGN KEY ("deliveryUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DeliverySettlement_verifiedById_fkey') THEN
    ALTER TABLE "DeliverySettlement" ADD CONSTRAINT "DeliverySettlement_verifiedById_fkey"
      FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Payment_deliverySettlementId_fkey') THEN
    ALTER TABLE "Payment" ADD CONSTRAINT "Payment_deliverySettlementId_fkey"
      FOREIGN KEY ("deliverySettlementId") REFERENCES "DeliverySettlement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "DeliverySettlement_tenantId_status_createdAt_idx"
  ON "DeliverySettlement"("tenantId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "DeliverySettlement_tenantId_deliveryUserId_createdAt_idx"
  ON "DeliverySettlement"("tenantId", "deliveryUserId", "createdAt");
CREATE INDEX IF NOT EXISTS "Payment_deliveryUserId_deliverySettlementId_idx"
  ON "Payment"("deliveryUserId", "deliverySettlementId");
CREATE INDEX IF NOT EXISTS "Payment_deliverySettlementId_idx" ON "Payment"("deliverySettlementId");
