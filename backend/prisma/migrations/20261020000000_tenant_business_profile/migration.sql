-- Perfil del negocio para los comprobantes: dirección, ciudad, departamento,
-- teléfono y RUC. Aditiva, idempotente y re-ejecutable.
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "address" TEXT;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "city" TEXT;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "department" TEXT;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "ruc" TEXT;
