-- Renumera los códigos largos MOB-<timestamp>… a la secuencia corta MOB-0001…
-- por empresa, en orden de creación. Dos pasos con prefijo TMP para no chocar
-- con la unique (tenantId, orderNumber). No toca códigos como E2E-SEED-001 ni
-- los MOB-<n> cortos que ya existan.
UPDATE "Order" SET "orderNumber" = 'TMP-' || "id" WHERE "orderNumber" ~ '^MOB-[0-9]{10,}';

WITH base AS (
  SELECT "tenantId", COALESCE(MAX(SUBSTRING("orderNumber" FROM 5)::BIGINT), 0) AS max_n
  FROM "Order"
  WHERE "orderNumber" ~ '^MOB-[0-9]{1,9}$'
  GROUP BY "tenantId"
),
orden AS (
  SELECT o."id", COALESCE(b.max_n, 0) + ROW_NUMBER() OVER (PARTITION BY o."tenantId" ORDER BY o."createdAt" ASC, o."id" ASC) AS n
  FROM "Order" o
  LEFT JOIN base b ON b."tenantId" = o."tenantId"
  WHERE o."orderNumber" LIKE 'TMP-%'
)
UPDATE "Order" o
SET "orderNumber" = 'MOB-' || LPAD(n.n::TEXT, 4, '0')
FROM orden n
WHERE o."id" = n."id";
