-- Descuentos fuera de política: una autorización de tipo DISCOUNT puede no
-- tener cliente (venta de consumidor final), se resuelve con un máximo en
-- guaraníes y queda marcada como usada por el pedido que la consumió.
ALTER TABLE "CustomerAuthorization" ALTER COLUMN "customerId" DROP NOT NULL;
ALTER TABLE "CustomerAuthorization" ADD COLUMN IF NOT EXISTS "usedAt" TIMESTAMP(3);
ALTER TABLE "CustomerAuthorization" ADD COLUMN IF NOT EXISTS "usedByOrderId" TEXT;
CREATE INDEX IF NOT EXISTS "CustomerAuthorization_usedByOrderId_idx" ON "CustomerAuthorization"("usedByOrderId");
