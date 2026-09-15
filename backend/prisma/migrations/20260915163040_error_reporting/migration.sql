-- Reporte de errores de clientes vía POST /api/errors.
-- Migración estrictamente aditiva: no se dropea ni altera nada existente.

-- CreateTable
CREATE TABLE "ErrorReport" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "requestId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'unhandled',
    "message" TEXT NOT NULL,
    "url" TEXT,
    "stack" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErrorReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ErrorReport_tenantId_createdAt_idx" ON "ErrorReport"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "ErrorReport" ADD CONSTRAINT "ErrorReport_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
