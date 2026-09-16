-- Departamento de la dirección del cliente, completado automáticamente al
-- elegir la ciudad. Migración estrictamente aditiva.

-- AlterTable
ALTER TABLE "CustomerAddress" ADD COLUMN "department" TEXT;
