-- Medios de pago configurables (#142): datos por medio en PaymentAccount
-- (documento del titular, procesadora, llave Pix, referencia y etiqueta de
-- moneda personalizada) y el medio Cripto/USDT. Aditiva, idempotente y
-- re-ejecutable: cada objeto se agrega solo si no existe.
ALTER TABLE "PaymentAccount" ADD COLUMN IF NOT EXISTS "document" TEXT;
ALTER TABLE "PaymentAccount" ADD COLUMN IF NOT EXISTS "processor" TEXT;
ALTER TABLE "PaymentAccount" ADD COLUMN IF NOT EXISTS "pixKey" TEXT;
ALTER TABLE "PaymentAccount" ADD COLUMN IF NOT EXISTS "reference" TEXT;
ALTER TABLE "PaymentAccount" ADD COLUMN IF NOT EXISTS "currencyLabel" TEXT;

-- Cripto/USDT como medio propio: en las cuentas de cobro y en los pagos (el
-- método del pago sale del tipo de cuenta). PostgreSQL 12+ permite agregar
-- valores a un enum dentro de la transacción de la migración.
ALTER TYPE "PaymentAccountKind" ADD VALUE IF NOT EXISTS 'CRYPTO';
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'CRYPTO';
