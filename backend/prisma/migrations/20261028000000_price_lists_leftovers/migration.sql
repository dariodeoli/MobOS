-- Restos del plan de listas de precios viejo que la migración
-- 20261024000000_price_lists dejó en la base (el CREATE TABLE IF NOT EXISTS fue
-- no-op porque 20261021000000_price_lists ya había creado la tabla con el
-- contrato nuevo). El modelo actual no declara ninguno de estos objetos, así
-- que `npm run db:check` los marcaba como diferencia. Aditiva, idempotente y
-- re-ejecutable: solo elimina lo que ya no está en el schema.
DROP INDEX IF EXISTS "Customer_tenantId_priceListId_idx";
ALTER TABLE "OrderItem" DROP COLUMN IF EXISTS "priceListId";
ALTER TABLE "PriceListItem" DROP COLUMN IF EXISTS "adjustment";
DROP TYPE IF EXISTS "PriceListAdjustment";
