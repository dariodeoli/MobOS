-- #461 (QA): el efectivo esperado se guarda con signo (retiros > cobros dan negativo, que es una
-- señal real) y una recepción no puede tener dos veces el mismo IMEI.

-- 1) Esperado de caja sin recorte en cero.
ALTER TABLE "CashSession" DROP CONSTRAINT IF EXISTS "CashSession_expectedPyg_check";

-- 2) Un IMEI/serial una sola vez por recepción. Primero se deduplican las filas repetidas
--    (se conserva la más antigua); recién entonces se crea el índice único.
DELETE FROM "SupplyReceptionItem" a
USING "SupplyReceptionItem" b
WHERE a."receptionId" = b."receptionId" AND a."serial" IS NOT NULL AND a."serial" = b."serial"
  AND (a."createdAt", a."id") > (b."createdAt", b."id");

CREATE UNIQUE INDEX IF NOT EXISTS "SupplyReceptionItem_receptionId_serial_key" ON "SupplyReceptionItem"("receptionId", "serial");
