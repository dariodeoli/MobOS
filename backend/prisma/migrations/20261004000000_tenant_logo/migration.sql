-- Logo de la empresa (comprobantes y documentos).
CREATE TABLE "TenantLogo" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "storageKey" TEXT,
  "data" BYTEA,
  "mimeType" TEXT NOT NULL,
  "sha256" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TenantLogo_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TenantLogo_tenantId_key" ON "TenantLogo"("tenantId");
ALTER TABLE "TenantLogo" ADD CONSTRAINT "TenantLogo_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
