-- Titulares de factura ya usados por cada cliente.
CREATE TABLE IF NOT EXISTS "CustomerBillingIdentity" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "document" TEXT,
  "uses" INTEGER NOT NULL DEFAULT 0,
  "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerBillingIdentity_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerBillingIdentity_customerId_name_document_key" ON "CustomerBillingIdentity"("customerId", "name", "document");
CREATE INDEX IF NOT EXISTS "CustomerBillingIdentity_tenantId_name_idx" ON "CustomerBillingIdentity"("tenantId", "name");
