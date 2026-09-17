-- Solicitudes comerciales del cliente (mayorista / crédito) con aprobación.
CREATE TABLE "CustomerRequest" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "customerName" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "requestedBy" TEXT,
  "requestedByName" TEXT,
  "requestedPricingTier" TEXT,
  "requestedCreditDays" INTEGER,
  "requestedCreditLimitPyg" INTEGER,
  "approvedPricingTier" TEXT,
  "approvedCreditDays" INTEGER,
  "approvedCreditLimitPyg" INTEGER,
  "note" TEXT,
  "resolvedBy" TEXT,
  "resolvedByName" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CustomerRequest_tenantId_status_idx" ON "CustomerRequest"("tenantId", "status");
CREATE INDEX "CustomerRequest_customerId_createdAt_idx" ON "CustomerRequest"("customerId", "createdAt");
