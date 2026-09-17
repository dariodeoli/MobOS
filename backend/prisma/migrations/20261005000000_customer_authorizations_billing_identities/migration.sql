-- Autorizaciones comerciales por cliente: el vendedor pide (mayorista,
-- crédito o plazo) y administración/gerencia resuelve, dejando el pedido y lo
-- autorizado por separado para que la cronología del cliente lo muestre.
CREATE TABLE IF NOT EXISTS "CustomerAuthorization" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requestedValue" JSONB,
    "resolvedValue" JSONB,
    "requestedById" TEXT NOT NULL,
    "resolvedById" TEXT,
    "note" TEXT,
    "resolvedNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "CustomerAuthorization_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CustomerAuthorization_tenantId_status_idx" ON "CustomerAuthorization"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "CustomerAuthorization_customerId_idx" ON "CustomerAuthorization"("customerId");

ALTER TABLE "CustomerAuthorization" DROP CONSTRAINT IF EXISTS "CustomerAuthorization_tenantId_fkey";
ALTER TABLE "CustomerAuthorization" ADD CONSTRAINT "CustomerAuthorization_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerAuthorization" DROP CONSTRAINT IF EXISTS "CustomerAuthorization_customerId_fkey";
ALTER TABLE "CustomerAuthorization" ADD CONSTRAINT "CustomerAuthorization_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerAuthorization" DROP CONSTRAINT IF EXISTS "CustomerAuthorization_requestedById_fkey";
ALTER TABLE "CustomerAuthorization" ADD CONSTRAINT "CustomerAuthorization_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerAuthorization" DROP CONSTRAINT IF EXISTS "CustomerAuthorization_resolvedById_fkey";
ALTER TABLE "CustomerAuthorization" ADD CONSTRAINT "CustomerAuthorization_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Razones sociales/RUC históricos de facturación del cliente. El RUC es único
-- dentro de la empresa y el cliente; se reutiliza para proponer facturación.
CREATE TABLE IF NOT EXISTS "CustomerBillingIdentity" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "document" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerBillingIdentity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CustomerBillingIdentity_tenantId_customerId_document_key" ON "CustomerBillingIdentity"("tenantId", "customerId", "document");
CREATE INDEX IF NOT EXISTS "CustomerBillingIdentity_customerId_idx" ON "CustomerBillingIdentity"("customerId");

ALTER TABLE "CustomerBillingIdentity" DROP CONSTRAINT IF EXISTS "CustomerBillingIdentity_tenantId_fkey";
ALTER TABLE "CustomerBillingIdentity" ADD CONSTRAINT "CustomerBillingIdentity_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerBillingIdentity" DROP CONSTRAINT IF EXISTS "CustomerBillingIdentity_customerId_fkey";
ALTER TABLE "CustomerBillingIdentity" ADD CONSTRAINT "CustomerBillingIdentity_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
