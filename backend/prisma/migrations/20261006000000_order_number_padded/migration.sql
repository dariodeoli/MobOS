-- Unifica el código visible de los pedidos al formato `PREFIX-#0001`
-- (padding a 4 dígitos, crece sin romper) para los códigos que quedaron con el
-- formato viejo `PREFIX #N` (sin padding). Solo cambia el código visible: el id
-- interno (UUID) sigue relacionando ítems, pagos, seriales, accesos públicos y
-- garantías, así que ninguna relación se rompe.

-- Paso 1: sale del espacio de nombres final para no chocar con el índice único
-- (tenantId, orderNumber) mientras se normaliza. El separador `:#` no lo genera
-- ningún camino de la app. El largo mínimo del lpad es 4: los números de 5+
-- dígitos conservan todos sus dígitos (lpad solo rellena, nunca recorta acá).
UPDATE "Order" o
  SET "orderNumber" = src.prefijo || ':#' || lpad(src.numero, GREATEST(4, length(src.numero)), '0'),
      "updatedAt" = now()
  FROM (
    SELECT "id",
           (regexp_match("orderNumber", '^([A-Z]{2,3}) #([0-9]+)$'))[1] AS prefijo,
           (regexp_match("orderNumber", '^([A-Z]{2,3}) #([0-9]+)$'))[2] AS numero
    FROM "Order"
    WHERE "orderNumber" ~ '^[A-Z]{2,3} #[0-9]+$'
  ) src
  WHERE o."id" = src."id";

-- Paso 2: formato final `PREFIX-#NNNN` con el mismo número.
UPDATE "Order"
  SET "orderNumber" = replace("orderNumber", ':#', '-#'),
      "updatedAt" = now()
  WHERE "orderNumber" ~ '^[A-Z]{2,3}:#[0-9]+$';

-- El contador de cada empresa queda por encima del máximo ya usado con su
-- prefijo, para que el próximo pedido no choque con el historial.
UPDATE "Tenant" t
  SET "orderNextNumber" = GREATEST(
    COALESCE(t."orderNextNumber", 1),
    COALESCE((
      SELECT MAX(CAST(SUBSTRING(o."orderNumber" FROM length(t."orderPrefix") + 3) AS BIGINT))
      FROM "Order" o
      WHERE o."tenantId" = t.id AND o."orderNumber" ~ ('^' || t."orderPrefix" || '-#[0-9]+$')
    ), 0) + 1
  )
  WHERE t."orderPrefix" IS NOT NULL;
