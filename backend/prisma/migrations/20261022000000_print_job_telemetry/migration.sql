-- Telemetría de impresión: cuándo se encoló cada trabajo, cuándo lo reclamó el
-- puente, cuándo reportó el resultado y cuánto tardó cada etapa. Aditiva,
-- idempotente y re-ejecutable: cada columna puede existir por una corrida
-- previa y el backfill no toca los trabajos que ya tienen el dato.
ALTER TABLE "PrintJob" ADD COLUMN IF NOT EXISTS "enqueuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "PrintJob" ADD COLUMN IF NOT EXISTS "printerName" TEXT;
ALTER TABLE "PrintJob" ADD COLUMN IF NOT EXISTS "queueMs" INTEGER;
ALTER TABLE "PrintJob" ADD COLUMN IF NOT EXISTS "durationMs" INTEGER;
ALTER TABLE "PrintJob" ADD COLUMN IF NOT EXISTS "transport" TEXT;

-- Trabajos previos al alta de la columna: la creación es el mejor enqueuedAt
-- disponible. Solo corrige las filas cuyo default quedó por delante.
UPDATE "PrintJob" SET "enqueuedAt" = "createdAt" WHERE "enqueuedAt" > "createdAt";

CREATE INDEX IF NOT EXISTS "PrintJob_tenantId_enqueuedAt_idx" ON "PrintJob"("tenantId", "enqueuedAt" DESC);
