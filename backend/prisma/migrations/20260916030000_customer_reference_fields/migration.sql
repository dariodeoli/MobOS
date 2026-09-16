-- Ficha de cliente alineada a las columnas de referencia del sistema
-- anterior (iFusion): id externo para migración sin duplicados, consentimientos
-- de marketing explícitos (email/SMS/WhatsApp, apagados por defecto),
-- exención fiscal y etiquetas. Migración estrictamente aditiva.

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN "externalId" TEXT,
ADD COLUMN "acceptsEmailMarketing" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "acceptsSmsMarketing" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "acceptsWhatsappMarketing" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "taxExempt" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "Customer_tenantId_externalId_idx" ON "Customer"("tenantId", "externalId");
