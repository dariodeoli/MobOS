-- Turnos de caja por usuario: cada persona abre y cierra su propio turno en la
-- sucursal (antes había una única caja abierta por sucursal). El desplazamiento
-- del índice parcial conserva las cajas abiertas existentes.
DROP INDEX IF EXISTS "CashSession_one_open_per_branch";
CREATE UNIQUE INDEX IF NOT EXISTS "CashSession_one_open_per_user" ON "CashSession"("tenantId", "branchId", "openedById") WHERE "status" = 'OPEN';

ALTER TABLE "CashSession" ADD COLUMN IF NOT EXISTS "countedBreakdown" JSONB;
