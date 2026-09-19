-- Número comercial de la orden de servicio (`OS-#0001`), aditivo e idempotente:
-- agrega la columna, numera lo existente por tienda y recién después crea el
-- índice único (así ninguna fila vieja queda sin número).
ALTER TABLE "ServiceOrder" ADD COLUMN IF NOT EXISTS "serviceNumber" TEXT;

UPDATE "ServiceOrder" AS o
SET "serviceNumber" = 'OS-#' || lpad(sub.rn::text, 4, '0')
FROM (
  SELECT id, row_number() OVER (PARTITION BY "tenantId" ORDER BY "createdAt", id) AS rn
  FROM "ServiceOrder"
  WHERE "serviceNumber" IS NULL
) AS sub
WHERE o.id = sub.id;

CREATE UNIQUE INDEX IF NOT EXISTS "ServiceOrder_tenantId_serviceNumber_key" ON "ServiceOrder"("tenantId", "serviceNumber");
