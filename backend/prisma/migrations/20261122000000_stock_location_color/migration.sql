-- #218: color por ubicación (depósito/sucursal) para el punto en las filas.
ALTER TABLE "StockLocation" ADD COLUMN IF NOT EXISTS "color" TEXT;
