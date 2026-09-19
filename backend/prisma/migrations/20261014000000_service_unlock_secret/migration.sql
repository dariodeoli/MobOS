-- Código de desbloqueo del equipo (PIN y/o patrón) cifrado por la aplicación.
-- Aditivo e idempotente: la columna nace vacía y se llena al recibir el equipo.
ALTER TABLE "ServiceOrder" ADD COLUMN IF NOT EXISTS "unlockSecret" TEXT;
ALTER TABLE "ServiceOrder" ADD COLUMN IF NOT EXISTS "unlockUpdatedAt" TIMESTAMP(3);
