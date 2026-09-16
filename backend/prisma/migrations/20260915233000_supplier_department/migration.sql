-- Departamento del proveedor, completado automáticamente al elegir la ciudad.
-- Migración estrictamente aditiva.

-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN "department" TEXT;
