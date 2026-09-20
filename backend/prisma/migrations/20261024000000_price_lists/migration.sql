-- Reconciliación: esta migración quedó superseded por
-- 20261021000000_price_lists, que ya crea PriceList, PriceListItem y PriceTier
-- con la forma definitiva del schema (escalones por ítem de lista,
-- `minQty`/`unitPricePyg`, sin tenantId propio). La versión anterior de este
-- archivo intentaba crear un PriceTier paralelo (tenantId/productId) y fallaba
-- con "column tenantId does not exist" al aplicar sobre la forma vigente.
--
-- Se conserva vacía y registrada para no reescribir la historia de migraciones:
-- cualquier base que la haya aplicado antes ya tiene los objetos de la 21.

-- El precio congelado por línea (`OrderItem.priceSource`) llegó después y el
-- schema lo declara; la migración que lo agregaba era esta, así que se conserva
-- el ALTER idempotente.
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "priceSource" TEXT;
