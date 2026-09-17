-- Usuario que creó la ficha del cliente (null = importada o por sistema).
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "createdById" TEXT;
ALTER TABLE "Customer" DROP CONSTRAINT IF EXISTS "Customer_createdById_fkey";
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
