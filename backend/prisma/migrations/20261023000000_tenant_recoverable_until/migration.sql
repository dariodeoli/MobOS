-- Ventana recuperable del archivado de empresa: hasta cuándo el dueño puede
-- restaurarla desde la app con correo, contraseña y la confirmación RESTORE.
-- Aditiva e idempotente: las empresas archivadas antes de esta columna quedan
-- con NULL y siguen recuperables.
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "recoverableUntil" TIMESTAMP(3);
