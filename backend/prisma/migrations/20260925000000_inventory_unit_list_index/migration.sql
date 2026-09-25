-- #247 (seguimiento de performance): la lista de Unidades ordena por estado y
-- después por más reciente (`ORDER BY status ASC, "updatedAt" DESC`). El índice
-- existente era (tenantId, status, reservedUntil) y Postgres terminaba haciendo
-- un orden incremental en memoria; éste sirve el orden completo.
CREATE INDEX IF NOT EXISTS "InventoryUnit_tenantId_status_updatedAt_idx"
  ON "InventoryUnit"("tenantId", status, "updatedAt" DESC);
