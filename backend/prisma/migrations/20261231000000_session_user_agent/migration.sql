-- #300: agente de usuario de la sesión para mostrar un dispositivo legible
-- («Chrome en MacBook · macOS»). Aditiva e idempotente.
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "userAgent" TEXT;
