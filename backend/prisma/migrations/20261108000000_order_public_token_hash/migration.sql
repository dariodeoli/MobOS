-- #178: el enlace de seguimiento de los pedidos deja de guardarse en claro.
--
-- - Los pedidos nuevos emiten su enlace como token de nivel rápido
--   (`OrderAccessToken`, impreso=false): el panel lo lista, lo reimprime y lo
--   rota desde «Regenerar acceso QR». `Order.publicToken` ya no se escribe.
-- - Los enlaces ya entregados siguen funcionando: se backfillea el hash (sha256)
--   del token legacy y la vista pública lo resuelve por hash, con fallback por
--   la columna vieja, hasta que se rote el acceso del pedido.
-- - `publicToken` pasa a ser opcional y sin default: los pedidos nuevos ya no
--   escriben el token en claro.
--
-- Aditiva e idempotente (re-ejecutable).
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "publicTokenHash" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "publicTokenIssuedAt" TIMESTAMP(3);
ALTER TABLE "Order" ALTER COLUMN "publicToken" DROP NOT NULL;
ALTER TABLE "Order" ALTER COLUMN "publicToken" DROP DEFAULT;
CREATE UNIQUE INDEX IF NOT EXISTS "Order_publicTokenHash_key" ON "Order"("publicTokenHash");

-- Backfill: sha256 del token legacy (núcleo de Postgres, sin extensiones).
UPDATE "Order"
  SET "publicTokenHash" = encode(sha256(convert_to("publicToken", 'UTF8')), 'hex'),
      "publicTokenIssuedAt" = COALESCE("publicTokenIssuedAt", "createdAt")
  WHERE "publicToken" IS NOT NULL
    AND "publicTokenHash" IS NULL
    AND length("publicToken") <= 200;
