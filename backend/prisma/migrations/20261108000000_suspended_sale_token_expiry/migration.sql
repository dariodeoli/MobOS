-- Vencimiento del enlace público del borrador (#172): el TTL se emite y se
-- valida con el reloj de Postgres (docs/TOKENS.md). Aditiva e idempotente: los
-- enlaces ya emitidos quedan en null (sin vencimiento) hasta regenerarse.
ALTER TABLE "SuspendedSale" ADD COLUMN IF NOT EXISTS "publicTokenExpiresAt" TIMESTAMP(3);
