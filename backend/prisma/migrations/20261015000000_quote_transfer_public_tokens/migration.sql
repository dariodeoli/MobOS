-- Acceso público de la cotización: token no enumerable que viaja en el QR o
-- enlace que el cliente abre para aceptar o rechazar sin sesión. Aditiva e
-- idempotente: la columna puede existir por una corrida previa.
ALTER TYPE "QuoteStatus" ADD VALUE IF NOT EXISTS 'REJECTED';
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "publicToken" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Quote_publicToken_key" ON "Quote"("publicToken");

-- Acceso público del remito de traslado: el destino confirma la recepción
-- física desde el QR sin sesión y deja nota de quién/cuándo recibió.
ALTER TABLE "StockTransfer" ADD COLUMN IF NOT EXISTS "publicToken" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "StockTransfer_publicToken_key" ON "StockTransfer"("publicToken");
ALTER TABLE "StockTransfer" ADD COLUMN IF NOT EXISTS "receivedById" TEXT;
ALTER TABLE "StockTransfer" ADD COLUMN IF NOT EXISTS "receivedNote" TEXT;
