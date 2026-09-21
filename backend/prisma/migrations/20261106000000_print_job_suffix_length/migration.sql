-- #138: largo del sufijo de confirmación en papel.
-- El valor sigue guardándose solo hasheado (suffixHash); este entero permite al
-- panel saber cuándo el operador terminó de escribir el código y validar solo.
-- Aditiva e idempotente: los trabajos anteriores quedan en 0 (desconocido) y el
-- panel cae al botón Confirmar como respaldo.
ALTER TABLE "PrintJob" ADD COLUMN IF NOT EXISTS "suffixLength" INTEGER NOT NULL DEFAULT 0;
