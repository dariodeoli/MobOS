-- Unifica las solicitudes comerciales en el motor de autorizaciones y retira
-- la tabla legacy (la pantalla que la usaba ya no existe).
--
-- Idempotente y re-ejecutable: los ids se derivan con prefijo 'legacy-cr-' y el
-- INSERT saltea lo que ya está. Se copian solo las filas con cliente y
-- solicitante vivos, porque el motor exige esas referencias; el resto queda
-- únicamente en el historial de auditoría (CUSTOMER_REQUEST_*).
INSERT INTO "CustomerAuthorization" (
  "id", "tenantId", "customerId", "kind", "status",
  "requestedValue", "resolvedValue", "requestedById", "resolvedById",
  "note", "createdAt", "resolvedAt"
)
SELECT
  'legacy-cr-' || cr."id",
  cr."tenantId",
  cr."customerId",
  cr."type",
  cr."status",
  CASE WHEN cr."type" = 'CREDIT'
    THEN jsonb_strip_nulls(jsonb_build_object(
      'creditDays', cr."requestedCreditDays",
      'creditLimitPyg', cr."requestedCreditLimitPyg"
    ))
    ELSE NULL
  END,
  CASE WHEN cr."type" = 'CREDIT'
    THEN jsonb_strip_nulls(jsonb_build_object(
      'creditDays', cr."approvedCreditDays",
      'creditLimitPyg', cr."approvedCreditLimitPyg"
    ))
    ELSE NULL
  END,
  cr."requestedBy",
  resolved."id",
  cr."note",
  cr."createdAt",
  cr."resolvedAt"
FROM "CustomerRequest" cr
JOIN "Customer" cliente
  ON cliente."id" = cr."customerId" AND cliente."tenantId" = cr."tenantId"
JOIN "User" solicitante
  ON solicitante."id" = cr."requestedBy" AND solicitante."tenantId" = cr."tenantId"
LEFT JOIN "User" resolved
  ON resolved."id" = cr."resolvedBy" AND resolved."tenantId" = cr."tenantId"
WHERE cr."requestedBy" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "CustomerAuthorization" existente
    WHERE existente."id" = 'legacy-cr-' || cr."id"
  );

DROP TABLE IF EXISTS "CustomerRequest";
