-- MobOS: private payment proofs and manual reconciliation.
-- Additive migration. Payment.status and payment totals remain unchanged.

CREATE TYPE "ReconciliationState" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

CREATE TABLE "PaymentProof" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymentProof_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaymentReconciliation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "state" "ReconciliationState" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "verifiedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PaymentReconciliation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaymentReconciliation_paymentId_key" ON "PaymentReconciliation"("paymentId");
CREATE INDEX "PaymentProof_tenantId_paymentId_createdAt_idx" ON "PaymentProof"("tenantId", "paymentId", "createdAt");
CREATE INDEX "PaymentProof_uploadedById_createdAt_idx" ON "PaymentProof"("uploadedById", "createdAt");
CREATE INDEX "PaymentReconciliation_tenantId_state_idx" ON "PaymentReconciliation"("tenantId", "state");
CREATE INDEX "PaymentReconciliation_verifiedById_updatedAt_idx" ON "PaymentReconciliation"("verifiedById", "updatedAt");

ALTER TABLE "PaymentProof"
  ADD CONSTRAINT "PaymentProof_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentProof"
  ADD CONSTRAINT "PaymentProof_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentProof"
  ADD CONSTRAINT "PaymentProof_uploadedById_fkey"
  FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PaymentReconciliation"
  ADD CONSTRAINT "PaymentReconciliation_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentReconciliation"
  ADD CONSTRAINT "PaymentReconciliation_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentReconciliation"
  ADD CONSTRAINT "PaymentReconciliation_verifiedById_fkey"
  FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
