-- Clientes (#160): nombres desdoblados y seguro del cliente con su porcentaje.
-- Aditiva, idempotente y re-ejecutable.
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "firstName" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "secondName" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "insuranceEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "insuranceRatePct" DECIMAL(5, 2);
