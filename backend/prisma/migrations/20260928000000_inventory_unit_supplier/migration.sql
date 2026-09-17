-- Proveedor estructurado por unidad: guarda la relación con Supplier (la
-- abreviatura sigue visible para vendedores; el nombre real es de admins).
ALTER TABLE "InventoryUnit" ADD COLUMN "supplierId" TEXT;
ALTER TABLE "InventoryUnit" ADD CONSTRAINT "InventoryUnit_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "InventoryUnit_tenantId_supplierId_idx" ON "InventoryUnit"("tenantId", "supplierId");
-- Completar la relación para las unidades que ya tenían la abreviatura/el nombre.
UPDATE "InventoryUnit" u
SET "supplierId" = s."id"
FROM "Supplier" s
WHERE s."tenantId" = u."tenantId"
  AND u."supplierId" IS NULL
  AND u."supplierName" IS NOT NULL
  AND (s."code" = u."supplierName" OR s."name" = u."supplierName");
