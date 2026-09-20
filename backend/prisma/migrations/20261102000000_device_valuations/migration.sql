-- Valuación automática de trade-in (#112): valor sugerido de toma por modelo,
-- capacidad y condición. Aditiva, idempotente y re-ejecutable: cada objeto se
-- crea solo si no existe, incluso si otra migración creó la tabla antes.
CREATE TABLE IF NOT EXISTS "DeviceValuation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "modelKey" TEXT NOT NULL,
    "storage" TEXT NOT NULL DEFAULT '',
    "condition" "ProductCondition" NOT NULL DEFAULT 'USED',
    "baseValuePyg" INTEGER NOT NULL,
    "maxValuePyg" INTEGER,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DeviceValuation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DeviceValuation_base_value_check" CHECK ("baseValuePyg" > 0),
    CONSTRAINT "DeviceValuation_max_value_check" CHECK ("maxValuePyg" IS NULL OR "maxValuePyg" >= "baseValuePyg")
);

-- Un CREATE TABLE IF NOT EXISTS sobre una tabla ya creada es no-op y dejaría
-- columnas afuera: se completan por separado, sin tocar lo existente.
ALTER TABLE "DeviceValuation" ADD COLUMN IF NOT EXISTS "model" TEXT;
ALTER TABLE "DeviceValuation" ADD COLUMN IF NOT EXISTS "modelKey" TEXT;
ALTER TABLE "DeviceValuation" ADD COLUMN IF NOT EXISTS "storage" TEXT NOT NULL DEFAULT '';
ALTER TABLE "DeviceValuation" ADD COLUMN IF NOT EXISTS "condition" "ProductCondition" NOT NULL DEFAULT 'USED';
ALTER TABLE "DeviceValuation" ADD COLUMN IF NOT EXISTS "baseValuePyg" INTEGER;
ALTER TABLE "DeviceValuation" ADD COLUMN IF NOT EXISTS "maxValuePyg" INTEGER;
ALTER TABLE "DeviceValuation" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "DeviceValuation" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "DeviceValuation" ADD COLUMN IF NOT EXISTS "createdById" TEXT;
ALTER TABLE "DeviceValuation" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "DeviceValuation" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX IF NOT EXISTS "DeviceValuation_tenantId_modelKey_storage_condition_key" ON "DeviceValuation"("tenantId", "modelKey", "storage", "condition");
CREATE INDEX IF NOT EXISTS "DeviceValuation_tenantId_isActive_idx" ON "DeviceValuation"("tenantId", "isActive");
CREATE INDEX IF NOT EXISTS "DeviceValuation_tenantId_condition_isActive_idx" ON "DeviceValuation"("tenantId", "condition", "isActive");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DeviceValuation_tenantId_fkey') THEN
    ALTER TABLE "DeviceValuation" ADD CONSTRAINT "DeviceValuation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
