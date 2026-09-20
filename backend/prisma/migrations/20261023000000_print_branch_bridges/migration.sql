-- Multi-puente por sucursal (#95): el puente y la impresora pueden pertenecer a
-- una sucursal. Aditiva, idempotente y re-ejecutable: las columnas usan
-- IF NOT EXISTS, la FK se recrea con DROP CONSTRAINT IF EXISTS y los índices se
-- sueltan antes de crearse.
ALTER TABLE "PrintBridge" ADD COLUMN IF NOT EXISTS "branchId" TEXT;
ALTER TABLE "PrintPrinter" ADD COLUMN IF NOT EXISTS "branchId" TEXT;

DROP INDEX IF EXISTS "PrintBridge_tenantId_branchId_idx";
CREATE INDEX IF NOT EXISTS "PrintBridge_tenantId_branchId_idx" ON "PrintBridge"("tenantId", "branchId");

DROP INDEX IF EXISTS "PrintPrinter_tenantId_branchId_idx";
CREATE INDEX IF NOT EXISTS "PrintPrinter_tenantId_branchId_idx" ON "PrintPrinter"("tenantId", "branchId");

ALTER TABLE "PrintBridge" DROP CONSTRAINT IF EXISTS "PrintBridge_branchId_fkey";
ALTER TABLE "PrintBridge" ADD CONSTRAINT "PrintBridge_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PrintPrinter" DROP CONSTRAINT IF EXISTS "PrintPrinter_branchId_fkey";
ALTER TABLE "PrintPrinter" ADD CONSTRAINT "PrintPrinter_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Auditoría: búsqueda por contenido del metadato (#59/#61). GIN jsonb_path_ops
-- para las consultas de contención; el detalle de la búsqueda por texto queda
-- documentado en backend/app/api/audit/route.ts.
CREATE INDEX IF NOT EXISTS "AuditLog_metadata_idx" ON "AuditLog" USING gin ("metadata" jsonb_path_ops);
