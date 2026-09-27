-- #276 · Transporte honesto en el historial de impresión: lo solicitado
-- (tcp/cups), el fallback con su motivo y la conexión física real de la cola
-- CUPS (lan/usb/serial), resuelta por el agente con la URI de `lpstat -v`.
-- Aditiva, idempotente y re-ejecutable: un `ADD COLUMN IF NOT EXISTS` sobre una
-- tabla ya migrada es no-op.
ALTER TABLE "PrintJob" ADD COLUMN IF NOT EXISTS "requestedTransport" TEXT NOT NULL DEFAULT '';
ALTER TABLE "PrintJob" ADD COLUMN IF NOT EXISTS "fallback" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PrintJob" ADD COLUMN IF NOT EXISTS "fallbackReason" TEXT NOT NULL DEFAULT '';
ALTER TABLE "PrintJob" ADD COLUMN IF NOT EXISTS "physicalConnection" TEXT NOT NULL DEFAULT '';
