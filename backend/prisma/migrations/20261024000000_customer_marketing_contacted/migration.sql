-- Campañas de recompra (#82): marca de último contacto de marketing en la
-- ficha del cliente. Aditiva, idempotente y re-ejecutable.
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "marketingContactedAt" TIMESTAMP(3);
