-- Verificación pública del cierre de caja (QR del comprobante impreso): cada
-- turno lleva un token único. Aditiva e idempotente; el relleno de las filas
-- existentes no vuelve a tocar las que ya tienen token.
ALTER TABLE "CashSession" ADD COLUMN IF NOT EXISTS "publicToken" TEXT;

UPDATE "CashSession"
SET "publicToken" = md5(random()::text || clock_timestamp()::text || "id")
WHERE "publicToken" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "CashSession_publicToken_key" ON "CashSession"("publicToken");
