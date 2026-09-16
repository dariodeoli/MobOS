-- Departamento de la sucursal, completado automáticamente al elegir la
-- ciudad. Migración estrictamente aditiva.

-- AlterTable
ALTER TABLE "Branch" ADD COLUMN "department" TEXT;
