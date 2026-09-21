-- Código comercial corto y uniforme para los pedidos que quedaron con formatos
-- viejos (`MOB #0001`, `MOB 0000000000123`, `KO #31754`, restos de
-- `MOB-MIGRANDO-…`): pasan a `PREFIX-#NNNN` con el prefijo de la empresa
-- (`Tenant.orderPrefix`, 2-3 letras; MOB por defecto) y numeración continua
-- por tienda, en orden de creación.
--
-- Aditiva, idempotente y re-ejecutable: solo toca los códigos que NO cumplen
-- el formato final. No crea ni borra pedidos y no cambia el id interno (UUID),
-- que es la dependencia real de ítems, seriales, pagos, cronología,
-- inventario, accesos QR/comprobantes y garantías.
--
-- A los pedidos ya conformes no se los renumera: la numeración nueva arranca
-- después del máximo ya usado por la empresa, así que reejecutar es un no-op y
-- nunca choca con el índice único (tenantId, orderNumber).

-- Paso 1: espacio de nombres temporal para no chocar con el índice único
-- mientras se renumera. El separador `:#` no lo genera ningún camino de la app.
UPDATE "Order" o
  SET "orderNumber" = 'MIGRACION:#' || o."id",
      "updatedAt" = now()
  WHERE o."orderNumber" IS NULL
     OR o."orderNumber" !~ '^[A-Z]{2,3}-#[0-9]{4,}$';

-- Paso 2: numeración por empresa, en orden de creación, continuando desde el
-- máximo ya usado por los pedidos conformes.
WITH maximos AS (
  SELECT o."tenantId",
         COALESCE(MAX((regexp_replace(o."orderNumber", '^[A-Z]{2,3}-#', ''))::BIGINT)
           FILTER (WHERE o."orderNumber" ~ '^[A-Z]{2,3}-#[0-9]{4,}$'), 0) AS maximo
  FROM "Order" o
  GROUP BY o."tenantId"
), numerados AS (
  SELECT o."id",
         o."tenantId",
         m.maximo + row_number() OVER (PARTITION BY o."tenantId" ORDER BY o."createdAt" ASC, o."id" ASC) AS numero
  FROM "Order" o
  JOIN maximos m ON m."tenantId" = o."tenantId"
  WHERE o."orderNumber" LIKE 'MIGRACION:#%'
)
UPDATE "Order" o
  SET "orderNumber" = COALESCE(NULLIF(regexp_replace(upper(COALESCE(t."orderPrefix", '')), '[^A-Z]', '', 'g'), ''), 'MOB')
        || '-#' || lpad(n.numero::text, GREATEST(4, length(n.numero::text)), '0'),
      "updatedAt" = now()
  FROM numerados n
  JOIN "Tenant" t ON t."id" = n."tenantId"
  WHERE o."id" = n."id";

-- El contador de la empresa queda por encima del máximo ya usado, para que el
-- próximo pedido no choque con el historial (idempotente: usa GREATEST).
UPDATE "Tenant" t
  SET "orderNextNumber" = GREATEST(
    COALESCE(t."orderNextNumber", 1),
    COALESCE((
      SELECT MAX((regexp_replace(o."orderNumber", '^[A-Z]{2,3}-#', ''))::BIGINT) + 1
      FROM "Order" o
      WHERE o."tenantId" = t."id" AND o."orderNumber" ~ '^[A-Z]{2,3}-#[0-9]{4,}$'
    ), 1)
  )
  WHERE EXISTS (
    SELECT 1 FROM "Order" o
    WHERE o."tenantId" = t."id" AND o."orderNumber" ~ '^[A-Z]{2,3}-#[0-9]{4,}$'
  );
