-- Enlace público del borrador de carrito (#154): el backend guarda solo el
-- sha256 del token de 64 hex (docs/TOKENS.md); se regenera para invalidar el
-- anterior. Aditiva e idempotente.
ALTER TABLE "SuspendedSale" ADD COLUMN IF NOT EXISTS "publicTokenHash" TEXT;
ALTER TABLE "SuspendedSale" ADD COLUMN IF NOT EXISTS "publicTokenIssuedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX IF NOT EXISTS "SuspendedSale_publicTokenHash_key" ON "SuspendedSale"("publicTokenHash");
