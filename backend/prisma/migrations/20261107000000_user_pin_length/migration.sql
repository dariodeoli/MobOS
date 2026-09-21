-- Largo del PIN de operador (4-6 dígitos), para que la pantalla de PIN valide
-- sola al completarlo. Aditiva e idempotente: los usuarios viejos quedan en
-- null y la app asume 4 (todos los PIN creados antes eran de 4 dígitos).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "pinLength" INTEGER;
