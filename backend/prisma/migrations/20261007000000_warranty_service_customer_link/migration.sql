-- Garantías y órdenes de servicio guardaban el nombre del cliente como texto.
-- La ficha 360 los cruzaba por nombre exacto, así que una tilde distinta hacía
-- que la garantía no apareciera en el perfil del cliente. Ahora hay relación
-- real con Customer, con relleno por nombre cuando no hay ambigüedad.

ALTER TABLE "WarrantyCase" ADD COLUMN IF NOT EXISTS "customerId" TEXT;

-- ServiceOrder.customerId ya existía como texto suelto: se limpian los valores
-- huérfanos antes de crear la clave foránea.
UPDATE "ServiceOrder" s SET "customerId" = NULL
  WHERE s."customerId" IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM "Customer" c WHERE c."id" = s."customerId");

-- Relleno: solo cuando el nombre coincide y hay una única ficha con ese
-- nombre en la tienda. La comparación no depende del locale: `translate`
-- pliega los acentos antes de `lower`, porque con collation C `lower()` no
-- baja las mayúsculas acentuadas y el cruce se perdería en silencio.
UPDATE "WarrantyCase" w SET "customerId" = c."id"
FROM "Customer" c
WHERE w."customerId" IS NULL
  AND c."tenantId" = w."tenantId"
  AND lower(translate(c."name", 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')) = lower(translate(w."customerName", 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun'))
  AND (SELECT count(*) FROM "Customer" c2 WHERE c2."tenantId" = w."tenantId" AND lower(translate(c2."name", 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')) = lower(translate(w."customerName", 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun'))) = 1;

UPDATE "ServiceOrder" s SET "customerId" = c."id"
FROM "Customer" c
WHERE s."customerId" IS NULL
  AND c."tenantId" = s."tenantId"
  AND lower(translate(c."name", 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')) = lower(translate(s."customerName", 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun'))
  AND (SELECT count(*) FROM "Customer" c2 WHERE c2."tenantId" = s."tenantId" AND lower(translate(c2."name", 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')) = lower(translate(s."customerName", 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun'))) = 1;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WarrantyCase_customerId_fkey') THEN
    ALTER TABLE "WarrantyCase"
      ADD CONSTRAINT "WarrantyCase_customerId_fkey"
      FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ServiceOrder_customerId_fkey') THEN
    ALTER TABLE "ServiceOrder"
      ADD CONSTRAINT "ServiceOrder_customerId_fkey"
      FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "WarrantyCase_customerId_idx" ON "WarrantyCase"("customerId");
CREATE INDEX IF NOT EXISTS "ServiceOrder_customerId_idx" ON "ServiceOrder"("customerId");
