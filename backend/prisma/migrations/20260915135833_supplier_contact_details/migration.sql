-- Detalle de contacto del proveedor para compras e importaciones.
-- Migración estrictamente aditiva: no se dropea ni altera nada existente.

-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN     "address" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "contactName" TEXT,
ADD COLUMN     "paymentTerms" TEXT;
