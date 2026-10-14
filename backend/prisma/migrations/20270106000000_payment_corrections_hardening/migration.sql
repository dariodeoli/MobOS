-- Endurecimiento de correcciones de pago (#393): aditiva, sin DROP COLUMN.
-- 1) Hash del cuerpo para que la misma Idempotency-Key con otro cuerpo sea 409.
-- 2) Un pago original o una corrección ya no pueden desaparecer dejando huérfana
--    a su reversión: las FK pasan de ON DELETE SET NULL a NO ACTION (se comprueba
--    al final de la sentencia, así borrar el pedido o la empresa entera, que
--    elimina todas las filas juntas, sigue funcionando).

ALTER TABLE "PaymentCorrection" ADD COLUMN IF NOT EXISTS "requestHash" TEXT;

ALTER TABLE "Payment" DROP CONSTRAINT IF EXISTS "Payment_correctionId_fkey";
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_correctionId_fkey" FOREIGN KEY ("correctionId") REFERENCES "PaymentCorrection"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "Payment" DROP CONSTRAINT IF EXISTS "Payment_reversalOfId_fkey";
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "Payment"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
