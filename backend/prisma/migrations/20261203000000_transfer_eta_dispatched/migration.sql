-- #218 · Traslados: ETA del lote y quién despachó/recibió, por nombre.
-- Aditiva e idempotente: las columnas nacen vacías y el nombre se resuelve por
-- relación; el backfill completa los lotes viejos una sola vez.
ALTER TABLE "StockTransfer" ADD COLUMN IF NOT EXISTS "eta" TIMESTAMP(3);
ALTER TABLE "StockTransfer" ADD COLUMN IF NOT EXISTS "dispatchedById" TEXT;

-- Quien registró el traslado es quien lo despachó (ahí los equipos quedan en
-- tránsito). Solo completa los vacíos: no pisa datos de flujos nuevos.
UPDATE "StockTransfer" SET "dispatchedById" = "createdById" WHERE "dispatchedById" IS NULL;

ALTER TABLE "StockTransfer" DROP CONSTRAINT IF EXISTS "StockTransfer_dispatchedById_fkey";
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_dispatchedById_fkey" FOREIGN KEY ("dispatchedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StockTransfer" DROP CONSTRAINT IF EXISTS "StockTransfer_receivedById_fkey";
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
