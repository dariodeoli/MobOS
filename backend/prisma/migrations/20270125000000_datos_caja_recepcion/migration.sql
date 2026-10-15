-- #461 (QA): el efectivo esperado se guarda con signo (retiros > cobros dan negativo, que es una
-- señal real) y una recepción no puede tener dos veces el mismo IMEI.

-- 1) Esperado de caja sin recorte en cero.
ALTER TABLE "CashSession" DROP CONSTRAINT IF EXISTS "CashSession_expectedPyg_check";

-- 2) Un IMEI/serial una sola vez por recepción, SIN borrar datos: si hubiera filas repetidas se
--    conserva el serial en la que cuenta (RECIBIDO > DANADO/INCORRECTO > SOBRANTE > FALTANTE, luego
--    la más antigua) y a las demás se les agrega un sufijo «#dup-N» y una nota. Re-ejecutable.
WITH ranked AS (
  SELECT "id",
         ROW_NUMBER() OVER (
           PARTITION BY "receptionId", "serial"
           ORDER BY CASE "resultado" WHEN 'RECIBIDO' THEN 0 WHEN 'DANADO' THEN 1 WHEN 'INCORRECTO' THEN 1 WHEN 'SOBRANTE' THEN 2 ELSE 3 END,
                    "createdAt", "id"
         ) AS n
  FROM "SupplyReceptionItem"
  WHERE "serial" IS NOT NULL
)
UPDATE "SupplyReceptionItem" s
SET "serial" = s."serial" || '#dup-' || (r.n - 1),
    "nota" = trim(both ' ' FROM coalesce(s."nota", '') || ' [escaneo repetido, renombrado por migración 20270125]')
FROM ranked r
WHERE s."id" = r."id" AND r.n > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "SupplyReceptionItem_receptionId_serial_key" ON "SupplyReceptionItem"("receptionId", "serial");
