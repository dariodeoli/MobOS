-- Ficha de unidad (#400, unidad A): ciclos y garantía de batería, código
-- interno por empresa (MOV-0001), ícono de ubicación, ícono/color/modo de
-- proveedor y sigla de la empresa. Aditiva e idempotente (cada objeto con
-- guard); el contenedor corre `prisma migrate deploy` en cada arranque.

ALTER TABLE "InventoryUnit" ADD COLUMN IF NOT EXISTS "batteryCycles" INTEGER;
ALTER TABLE "InventoryUnit" ADD COLUMN IF NOT EXISTS "warrantyUntil" TIMESTAMP(3);
ALTER TABLE "InventoryUnit" ADD COLUMN IF NOT EXISTS "internalSeq" INTEGER;
ALTER TABLE "StockLocation" ADD COLUMN IF NOT EXISTS "icon" TEXT;
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "icon" TEXT;
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "color" TEXT;
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "displayMode" TEXT NOT NULL DEFAULT 'ABREVIADO';
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "unitCodePrefix" TEXT;

-- Contadores por empresa. Una fila por (empresa, clave); `next` es el próximo
-- número a entregar. No se usa la fila del Tenant: lib/order-number.ts la
-- bloquea FOR UPDATE en cada venta y las unidades no deben frenar ventas.
CREATE TABLE IF NOT EXISTS "TenantSequence" (
  "tenantId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "next" BIGINT NOT NULL DEFAULT 1,
  CONSTRAINT "TenantSequence_pkey" PRIMARY KEY ("tenantId", "key")
);
DO $$ BEGIN
  ALTER TABLE "TenantSequence" ADD CONSTRAINT "TenantSequence_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Ciclos de batería: pasan de inspection.bateriaCiclos a columna cuando son
-- un entero razonable.
UPDATE "InventoryUnit"
SET "batteryCycles" = ("inspection"->>'bateriaCiclos')::INTEGER
WHERE "batteryCycles" IS NULL
  AND jsonb_typeof("inspection") = 'object'
  AND "inspection"->>'bateriaCiclos' ~ '^[0-9]{1,6}$';

-- Backfill del correlativo por fecha de ingreso (incluye unidades eliminadas:
-- el número nunca se reutiliza). Continúa después del máximo ya asignado.
WITH base AS (
  SELECT "tenantId", COALESCE(MAX("internalSeq"), 0) AS maximo
  FROM "InventoryUnit" GROUP BY "tenantId"
), orden AS (
  SELECT u."id", b.maximo + ROW_NUMBER() OVER (PARTITION BY u."tenantId" ORDER BY u."createdAt", u."id") AS seq
  FROM "InventoryUnit" u JOIN base b ON b."tenantId" = u."tenantId"
  WHERE u."internalSeq" IS NULL
)
UPDATE "InventoryUnit" u SET "internalSeq" = orden.seq
FROM orden WHERE u."id" = orden."id";

CREATE UNIQUE INDEX IF NOT EXISTS "InventoryUnit_tenantId_internalSeq_key" ON "InventoryUnit"("tenantId", "internalSeq");

-- Siembra del contador: máximo + 1 (nunca retrocede si ya existía).
INSERT INTO "TenantSequence" ("tenantId", "key", "next")
SELECT "tenantId", 'unit', MAX("internalSeq") + 1 FROM "InventoryUnit"
WHERE "internalSeq" IS NOT NULL GROUP BY "tenantId"
ON CONFLICT ("tenantId", "key") DO UPDATE SET "next" = GREATEST("TenantSequence"."next", EXCLUDED."next");

-- Asignación atómica: cubre todos los caminos que crean unidades (API, importes,
-- SQL directo). El UPSERT toma el lock de UNA fila por (empresa, clave) hasta
-- el fin de la transacción: sin duplicados ni huecos por carrera, y una
-- transacción que falla devuelve el número.
CREATE OR REPLACE FUNCTION "assign_inventory_unit_internal_seq"() RETURNS trigger AS $$
BEGIN
  IF NEW."internalSeq" IS NULL THEN
    INSERT INTO "TenantSequence" ("tenantId", "key", "next") VALUES (NEW."tenantId", 'unit', 2)
    ON CONFLICT ("tenantId", "key") DO UPDATE SET "next" = "TenantSequence"."next" + 1
    RETURNING "next" - 1 INTO NEW."internalSeq";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "InventoryUnit_assign_internal_seq" ON "InventoryUnit";
CREATE TRIGGER "InventoryUnit_assign_internal_seq"
  BEFORE INSERT ON "InventoryUnit"
  FOR EACH ROW EXECUTE FUNCTION "assign_inventory_unit_internal_seq"();
