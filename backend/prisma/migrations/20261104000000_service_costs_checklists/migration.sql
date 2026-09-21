-- Servicio técnico (#122): costos desglosados y checklist configurable.
-- Aditiva, idempotente y re-ejecutable: cada objeto se crea solo si no existe
-- y las columnas se completan por separado (un CREATE TABLE IF NOT EXISTS sobre
-- una tabla ya creada es no-op y dejaría columnas afuera).

ALTER TABLE "ServiceOrder" ADD COLUMN IF NOT EXISTS "partsPyg" INTEGER;
ALTER TABLE "ServiceOrder" ADD COLUMN IF NOT EXISTS "laborPyg" INTEGER;
ALTER TABLE "ServiceOrder" ADD COLUMN IF NOT EXISTS "otherCostPyg" INTEGER;

CREATE TABLE IF NOT EXISTS "ServiceChecklistItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "deviceType" TEXT NOT NULL DEFAULT 'iPhone',
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ServiceChecklistItem_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ServiceChecklistItem" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "ServiceChecklistItem" ADD COLUMN IF NOT EXISTS "deviceType" TEXT DEFAULT 'iPhone';
ALTER TABLE "ServiceChecklistItem" ADD COLUMN IF NOT EXISTS "label" TEXT;
ALTER TABLE "ServiceChecklistItem" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER DEFAULT 0;
ALTER TABLE "ServiceChecklistItem" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN DEFAULT true;
ALTER TABLE "ServiceChecklistItem" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
-- `updatedAt` lo maneja Prisma (@updatedAt): la columna no lleva DEFAULT en la
-- base, pero al agregarla a una tabla existente se completa con el momento del
-- cambio y después se quita el default.
ALTER TABLE "ServiceChecklistItem" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "ServiceChecklistItem" ALTER COLUMN "updatedAt" DROP DEFAULT;

CREATE UNIQUE INDEX IF NOT EXISTS "ServiceChecklistItem_tenantId_deviceType_label_key" ON "ServiceChecklistItem"("tenantId", "deviceType", "label");
CREATE INDEX IF NOT EXISTS "ServiceChecklistItem_tenantId_deviceType_isActive_idx" ON "ServiceChecklistItem"("tenantId", "deviceType", "isActive");

-- Reconciliación base ↔ modelo (drift previo): schema.prisma declara el índice
-- GIN de auditoría con la opclass jsonb_path_ops y la base tenía la opclass por
-- defecto. Se recrea tal como la espera `npm run db:check`; es idempotente.
DROP INDEX IF EXISTS "AuditLog_metadata_idx";
CREATE INDEX IF NOT EXISTS "AuditLog_metadata_idx" ON "AuditLog" USING GIN ("metadata" jsonb_path_ops);
