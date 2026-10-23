-- Retención de IMEI en el carrito del POS (apartado de 5 min). Aditiva e idempotente.
DO $$ BEGIN
  CREATE TYPE "InventoryReservationKind" AS ENUM ('CUSTOMER', 'CART_HOLD');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "InventoryUnit" ADD COLUMN IF NOT EXISTS "reservationKind" "InventoryReservationKind";
ALTER TABLE "InventoryUnit" ADD COLUMN IF NOT EXISTS "holdCartId" TEXT;
ALTER TABLE "InventoryUnit" ADD COLUMN IF NOT EXISTS "holdDeviceId" TEXT;
ALTER TABLE "InventoryUnit" ADD COLUMN IF NOT EXISTS "holdStartedAt" TIMESTAMP(3);

-- Lo que hoy está reservado es una reserva de cliente.
UPDATE "InventoryUnit" SET "reservationKind" = 'CUSTOMER' WHERE "status" = 'RESERVED' AND "reservationKind" IS NULL;

CREATE INDEX IF NOT EXISTS "InventoryUnit_tenantId_reservedById_reservationKind_idx" ON "InventoryUnit"("tenantId", "reservedById", "reservationKind");
CREATE INDEX IF NOT EXISTS "InventoryUnit_tenantId_holdCartId_idx" ON "InventoryUnit"("tenantId", "holdCartId");
