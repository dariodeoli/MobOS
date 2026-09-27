-- #277 · PRN: plantilla del ticket de prueba por impresora (bloques, ancho,
-- corte, copias y tipo). Aditiva, idempotente y re-ejecutable: una base que ya
-- tenga la columna no cambia, y el modelo la declara desde el schema.
ALTER TABLE "PrintPrinter" ADD COLUMN IF NOT EXISTS "testTemplate" JSONB;
