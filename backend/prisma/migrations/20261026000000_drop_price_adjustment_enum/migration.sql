-- Enum huérfano del diseño viejo de listas de precios: `PriceListItem` se creó
-- con las columnas actuales (unitPricePyg/unitPriceUsd/discountPct), así que
-- ningún campo usa `PriceListAdjustment`. Se elimina solo si no está en uso
-- para que la base coincida con el modelo sin romper bases con diseño viejo.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PriceListAdjustment')
     AND NOT EXISTS (
       SELECT 1
       FROM pg_attribute a
       JOIN pg_type t ON t.oid = a.atttypid
       WHERE t.typname = 'PriceListAdjustment'
         AND a.attnum > 0
         AND NOT a.attisdropped
     ) THEN
    DROP TYPE "PriceListAdjustment";
  END IF;
END $$;
