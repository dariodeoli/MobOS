-- #250 · #83 — Repuestos a crédito: cuenta a pagar al proveedor con condición
-- (contado, crédito con vencimiento o consignación/depósito del proveedor, que
-- no impacta en Finanzas hasta el consumo). Aditiva, idempotente y
-- re-ejecutable: el tipo y la tabla se crean solo si faltan y las columnas se
-- agregan con IF NOT EXISTS por si una migración previa creó la tabla.
DO $$ BEGIN
  CREATE TYPE "SupplierPayableCondition" AS ENUM ('CONTADO', 'CREDITO', 'CONSIGNACION');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "SupplierPayable" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "supplierId" TEXT,
    "supplierName" TEXT NOT NULL,
    "concept" TEXT NOT NULL,
    "condition" "SupplierPayableCondition" NOT NULL DEFAULT 'CONTADO',
    "amountPyg" INTEGER NOT NULL DEFAULT 0,
    "paidPyg" INTEGER NOT NULL DEFAULT 0,
    "consumedPyg" INTEGER NOT NULL DEFAULT 0,
    "dueAt" TIMESTAMP(3),
    "reference" TEXT,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierPayable_pkey" PRIMARY KEY ("id")
);

-- Columnas que podrían faltar si la tabla ya existía (regla de conciliación
-- base ↔ modelo: un CREATE TABLE IF NOT EXISTS sobre una tabla creada es no-op).
ALTER TABLE "SupplierPayable" ADD COLUMN IF NOT EXISTS "branchId" TEXT;
ALTER TABLE "SupplierPayable" ADD COLUMN IF NOT EXISTS "supplierId" TEXT;
ALTER TABLE "SupplierPayable" ADD COLUMN IF NOT EXISTS "supplierName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SupplierPayable" ADD COLUMN IF NOT EXISTS "concept" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SupplierPayable" ADD COLUMN IF NOT EXISTS "condition" "SupplierPayableCondition" NOT NULL DEFAULT 'CONTADO';
ALTER TABLE "SupplierPayable" ADD COLUMN IF NOT EXISTS "amountPyg" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SupplierPayable" ADD COLUMN IF NOT EXISTS "paidPyg" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SupplierPayable" ADD COLUMN IF NOT EXISTS "consumedPyg" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SupplierPayable" ADD COLUMN IF NOT EXISTS "dueAt" TIMESTAMP(3);
ALTER TABLE "SupplierPayable" ADD COLUMN IF NOT EXISTS "reference" TEXT;
ALTER TABLE "SupplierPayable" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "SupplierPayable" ADD COLUMN IF NOT EXISTS "createdById" TEXT;
ALTER TABLE "SupplierPayable" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "SupplierPayable" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS "SupplierPayable_tenantId_condition_dueAt_idx" ON "SupplierPayable"("tenantId", "condition", "dueAt");
CREATE INDEX IF NOT EXISTS "SupplierPayable_tenantId_supplierId_createdAt_idx" ON "SupplierPayable"("tenantId", "supplierId", "createdAt");

ALTER TABLE "SupplierPayable" DROP CONSTRAINT IF EXISTS "SupplierPayable_tenantId_fkey";
ALTER TABLE "SupplierPayable" ADD CONSTRAINT "SupplierPayable_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplierPayable" DROP CONSTRAINT IF EXISTS "SupplierPayable_branchId_fkey";
ALTER TABLE "SupplierPayable" ADD CONSTRAINT "SupplierPayable_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupplierPayable" DROP CONSTRAINT IF EXISTS "SupplierPayable_supplierId_fkey";
ALTER TABLE "SupplierPayable" ADD CONSTRAINT "SupplierPayable_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupplierPayable" DROP CONSTRAINT IF EXISTS "SupplierPayable_createdById_fkey";
ALTER TABLE "SupplierPayable" ADD CONSTRAINT "SupplierPayable_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
