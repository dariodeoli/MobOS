-- SIFEN (#130, Fase 1): documento electrónico por pedido con XML, CDC y
-- estado. Aditiva, idempotente y re-ejecutable: cada objeto se crea solo si no
-- existe, y las columnas se completan por separado para el caso de una tabla
-- preexistente creada por una versión anterior.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SifenDocumentStatus') THEN
    CREATE TYPE "SifenDocumentStatus" AS ENUM ('DRAFT', 'SENT', 'APPROVED', 'REJECTED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "SifenDocument" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" "SifenDocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "ambiente" TEXT NOT NULL DEFAULT 'test',
    "tipoDocumento" INTEGER NOT NULL DEFAULT 1,
    "establecimiento" TEXT NOT NULL,
    "puntoExpedicion" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "timbrado" TEXT NOT NULL,
    "cdc" TEXT,
    "xml" TEXT,
    "respuesta" JSONB,
    "error" TEXT,
    "enviadoAt" TIMESTAMP(3),
    "resueltoAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SifenDocument_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "SifenDocument" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "SifenDocument" ADD COLUMN IF NOT EXISTS "orderId" TEXT;
ALTER TABLE "SifenDocument" ADD COLUMN IF NOT EXISTS "status" "SifenDocumentStatus" NOT NULL DEFAULT 'DRAFT';
ALTER TABLE "SifenDocument" ADD COLUMN IF NOT EXISTS "ambiente" TEXT NOT NULL DEFAULT 'test';
ALTER TABLE "SifenDocument" ADD COLUMN IF NOT EXISTS "tipoDocumento" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "SifenDocument" ADD COLUMN IF NOT EXISTS "establecimiento" TEXT;
ALTER TABLE "SifenDocument" ADD COLUMN IF NOT EXISTS "puntoExpedicion" TEXT;
ALTER TABLE "SifenDocument" ADD COLUMN IF NOT EXISTS "numero" INTEGER;
ALTER TABLE "SifenDocument" ADD COLUMN IF NOT EXISTS "timbrado" TEXT;
ALTER TABLE "SifenDocument" ADD COLUMN IF NOT EXISTS "cdc" TEXT;
ALTER TABLE "SifenDocument" ADD COLUMN IF NOT EXISTS "xml" TEXT;
ALTER TABLE "SifenDocument" ADD COLUMN IF NOT EXISTS "respuesta" JSONB;
ALTER TABLE "SifenDocument" ADD COLUMN IF NOT EXISTS "error" TEXT;
ALTER TABLE "SifenDocument" ADD COLUMN IF NOT EXISTS "enviadoAt" TIMESTAMP(3);
ALTER TABLE "SifenDocument" ADD COLUMN IF NOT EXISTS "resueltoAt" TIMESTAMP(3);
ALTER TABLE "SifenDocument" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "SifenDocument" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX IF NOT EXISTS "SifenDocument_orderId_ambiente_key" ON "SifenDocument"("orderId", "ambiente");
CREATE INDEX IF NOT EXISTS "SifenDocument_tenantId_status_idx" ON "SifenDocument"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "SifenDocument_tenantId_createdAt_idx" ON "SifenDocument"("tenantId", "createdAt");
CREATE INDEX IF NOT EXISTS "SifenDocument_cdc_idx" ON "SifenDocument"("cdc");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SifenDocument_tenantId_fkey') THEN
    ALTER TABLE "SifenDocument" ADD CONSTRAINT "SifenDocument_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SifenDocument_orderId_fkey') THEN
    ALTER TABLE "SifenDocument" ADD CONSTRAINT "SifenDocument_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
