-- #455: entrega real en efectivo, vuelto como egreso de caja y esperado por moneda. Aditiva y re-ejecutable.
ALTER TYPE "CashMovementKind" ADD VALUE IF NOT EXISTS 'CHANGE';

ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "tenderedAmount" DECIMAL(18,2);

ALTER TABLE "CashMovement" ADD COLUMN IF NOT EXISTS "orderId" TEXT;
ALTER TABLE "CashMovement" ADD COLUMN IF NOT EXISTS "cashSessionId" TEXT;
ALTER TABLE "CashMovement" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;
CREATE INDEX IF NOT EXISTS "CashMovement_orderId_idx" ON "CashMovement"("orderId");
CREATE UNIQUE INDEX IF NOT EXISTS "CashMovement_tenantId_idempotencyKey_key" ON "CashMovement"("tenantId", "idempotencyKey");

ALTER TABLE "CashSession" ADD COLUMN IF NOT EXISTS "expectedByCurrency" JSONB;
ALTER TABLE "CashSession" ADD COLUMN IF NOT EXISTS "countedByCurrency" JSONB;
