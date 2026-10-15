-- Alias opcional de la cuenta de cobro (RUC, correo, teléfono u otro).
-- Aditiva e idempotente.
ALTER TABLE "PaymentAccount" ADD COLUMN IF NOT EXISTS "aliasType" TEXT;
ALTER TABLE "PaymentAccount" ADD COLUMN IF NOT EXISTS "aliasValue" TEXT;
