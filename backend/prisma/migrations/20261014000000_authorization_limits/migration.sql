-- Umbrales de autorización por empresa: monto de gasto y de compra a crédito
-- que un rol operativo puede registrar sin autorización de gerencia. Null usa
-- el default de la aplicación (1.000.000 y 5.000.000 Gs. respectivamente).
-- Aditiva e idempotente: cada columna puede existir por una corrida previa.
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "expenseLimitPyg" INTEGER;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "purchaseCreditLimitPyg" INTEGER;
