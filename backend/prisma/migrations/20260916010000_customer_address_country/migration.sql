-- País de la dirección del cliente, predeterminado Paraguay para ahorrar
-- clicks y editable por el usuario. Migración estrictamente aditiva.

-- AlterTable
ALTER TABLE "CustomerAddress" ADD COLUMN "country" TEXT NOT NULL DEFAULT 'Paraguay';
