-- Corrección del medio de pago de una venta (#393). Aditiva e idempotente: sin
-- DROP ni cambios a filas existentes. El pago original nunca se edita; la
-- corrección agrega una reversión (Payment.reversalOfId) y pagos nuevos, todos
-- ligados por Payment.correctionId.

CREATE TABLE IF NOT EXISTS "PaymentCorrection" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "branchId" TEXT,
  "orderId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "createdById" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "before" JSONB NOT NULL,
  "after" JSONB NOT NULL,
  "originSessionClosed" BOOLEAN NOT NULL DEFAULT false,
  "drawerImpact" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentCorrection_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "correctionId" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "reversalOfId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "PaymentCorrection_tenantId_idempotencyKey_key" ON "PaymentCorrection"("tenantId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "PaymentCorrection_tenantId_orderId_idx" ON "PaymentCorrection"("tenantId", "orderId");
CREATE INDEX IF NOT EXISTS "PaymentCorrection_tenantId_createdAt_idx" ON "PaymentCorrection"("tenantId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "Payment_reversalOfId_key" ON "Payment"("reversalOfId");
CREATE INDEX IF NOT EXISTS "Payment_correctionId_idx" ON "Payment"("correctionId");

DO $$ BEGIN
  ALTER TABLE "PaymentCorrection" ADD CONSTRAINT "PaymentCorrection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "PaymentCorrection" ADD CONSTRAINT "PaymentCorrection_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "PaymentCorrection" ADD CONSTRAINT "PaymentCorrection_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "Payment" ADD CONSTRAINT "Payment_correctionId_fkey" FOREIGN KEY ("correctionId") REFERENCES "PaymentCorrection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "Payment" ADD CONSTRAINT "Payment_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
