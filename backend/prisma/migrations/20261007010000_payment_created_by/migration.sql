-- Usuario real que registró cada pago (null = pago anterior a esta columna).
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "createdById" TEXT;
ALTER TABLE "Payment" DROP CONSTRAINT IF EXISTS "Payment_createdById_fkey";
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
UPDATE "Payment" p SET "createdById" = o."sellerId" FROM "Order" o WHERE p."orderId" = o."id" AND p."createdById" IS NULL;
