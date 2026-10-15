-- Nonce de un solo uso emitido por el servidor para Apple/Google nativos. Aditiva e idempotente.
CREATE TABLE IF NOT EXISTS "AuthNonce" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthNonce_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AuthNonce_tokenHash_key" ON "AuthNonce"("tokenHash");
CREATE INDEX IF NOT EXISTS "AuthNonce_expiresAt_idx" ON "AuthNonce"("expiresAt");
