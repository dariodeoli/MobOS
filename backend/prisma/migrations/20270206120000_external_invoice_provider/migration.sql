DO $$ BEGIN
  CREATE TYPE "ExternalInvoiceStatus" AS ENUM ('PENDING', 'ACCEPTED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "ExternalInvoice" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "status" "ExternalInvoiceStatus" NOT NULL DEFAULT 'PENDING',
  "idempotencyKey" TEXT NOT NULL,
  "simulated" BOOLEAN NOT NULL DEFAULT false,
  "payload" JSONB NOT NULL,
  "providerDocumentId" TEXT,
  "documentNumber" TEXT,
  "documentUrl" TEXT,
  "error" TEXT,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ExternalInvoice_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ExternalInvoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ExternalInvoice_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "ExternalInvoice_orderId_key" ON "ExternalInvoice"("orderId");
CREATE UNIQUE INDEX IF NOT EXISTS "ExternalInvoice_tenantId_idempotencyKey_key" ON "ExternalInvoice"("tenantId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "ExternalInvoice_tenantId_status_createdAt_idx" ON "ExternalInvoice"("tenantId", "status", "createdAt");
