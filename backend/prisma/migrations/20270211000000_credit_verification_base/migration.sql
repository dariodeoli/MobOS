-- Venta a crédito con tolerancia + verificación de pagos (Etapa 0). Aditiva e idempotente.

-- Payment: motivo del estado PENDING. Los PENDING viejos quedan en NULL (= MANUAL).
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "pendingReason" TEXT;
CREATE INDEX IF NOT EXISTS "Payment_tenantId_pendingReason_status_idx" ON "Payment"("tenantId", "pendingReason", "status");

-- PaymentReconciliation: cómo y cuándo se resolvió.
ALTER TABLE "PaymentReconciliation" ADD COLUMN IF NOT EXISTS "resolvedVia" TEXT;
ALTER TABLE "PaymentReconciliation" ADD COLUMN IF NOT EXISTS "resolvedAt" TIMESTAMP(3);

-- Customer: plazo y tolerancia propios (null = valor del módulo).
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "creditTolerancePct" INTEGER;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "creditTermMode" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "creditDayOfMonth" INTEGER;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "creditInstallments" INTEGER;

-- Discrepancias de la verificación diaria.
CREATE TABLE IF NOT EXISTS "PaymentVerificationDiscrepancy" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "businessDay" VARCHAR(10) NOT NULL,
    "scope" TEXT NOT NULL,
    "paymentId" TEXT,
    "method" TEXT NOT NULL,
    "accountId" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'PYG',
    "expectedPyg" BIGINT NOT NULL,
    "receivedPyg" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "requestId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "resolvedNote" TEXT,

    CONSTRAINT "PaymentVerificationDiscrepancy_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PaymentVerificationDiscrepancy_tenantId_requestId_key" ON "PaymentVerificationDiscrepancy"("tenantId", "requestId");
CREATE INDEX IF NOT EXISTS "PaymentVerificationDiscrepancy_tenantId_branchId_businessDa_idx" ON "PaymentVerificationDiscrepancy"("tenantId", "branchId", "businessDay");
DO $$ BEGIN
  ALTER TABLE "PaymentVerificationDiscrepancy" ADD CONSTRAINT "PaymentVerificationDiscrepancy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Clasificación de los PENDING existentes (nunca VERIFICACION: ese motivo solo nace de la política nueva).
UPDATE "Payment" SET "pendingReason" = 'REPARTO' WHERE "status" = 'PENDING' AND "pendingReason" IS NULL AND ("deliveryUserId" IS NOT NULL OR "deliverySettlementId" IS NOT NULL);
UPDATE "Payment" SET "pendingReason" = 'CUOTA' WHERE "status" = 'PENDING' AND "pendingReason" IS NULL AND "method" = 'CREDIT' AND "dueAt" IS NOT NULL;
