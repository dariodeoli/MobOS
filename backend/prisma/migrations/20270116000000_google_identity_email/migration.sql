-- Correo verificado por Google en la identidad (escrito solo por el login de
-- Google). El panel de plataforma lo usa como única prueba de identidad del
-- dueño. Aditiva e idempotente; las filas existentes se llenan en el próximo acceso.
ALTER TABLE "GoogleIdentity" ADD COLUMN IF NOT EXISTS "email" TEXT;
