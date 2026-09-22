-- #218: color propio de cada ubicación (opcional), usado en la tabla y en las etiquetas.
-- Aditiva e idempotente.
ALTER TABLE "StockLocation" ADD COLUMN IF NOT EXISTS "color" TEXT;
