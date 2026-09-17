-- Código comercial corto para los pedidos creados por la app: los que quedaron
-- con el formato largo `MOB-<timestamp><aleatorio>` pasan a `MOB-#0001`,
-- `MOB-#0002`, … en orden de creación y por tienda. Los pedidos sembrados
-- (`KO #31754`) no se tocan. Se renombra únicamente el código visible: el id
-- interno (UUID) sigue relacionando ítems, pagos, seriales, accesos públicos y
-- garantías, así que ninguna relación se rompe.

-- Paso 1: salir del espacio de nombres largo para no chocar con el índice
-- único (tenantId, orderNumber) mientras se renumera.
UPDATE "Order"
  SET "orderNumber" = 'MOB-MIGRANDO-' || "id"
  WHERE "orderNumber" ~ '^MOB-[0-9]{13}';

-- Paso 2: numeración secuencial por tienda, en orden de creación.
WITH numerados AS (
  SELECT "id",
         row_number() OVER (PARTITION BY "tenantId" ORDER BY "createdAt" ASC, "id" ASC) AS posicion
  FROM "Order"
  WHERE "orderNumber" LIKE 'MOB-MIGRANDO-%'
)
UPDATE "Order" o
  SET "orderNumber" = 'MOB-#' || lpad(n."posicion"::text, 4, '0'),
      "updatedAt" = now()
  FROM numerados n
  WHERE o."id" = n."id";
