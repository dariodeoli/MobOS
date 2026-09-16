-- Código de verificación física del vendedor (OK VPC/VPM/VPE/VPS) por unidad
-- y abreviatura de proveedor visible para vendedores (el nombre real queda
-- disponible para administración).
ALTER TABLE "InventoryUnit" ADD COLUMN "verifiedByCode" TEXT;
ALTER TABLE "Supplier" ADD COLUMN "code" TEXT;
CREATE UNIQUE INDEX "Supplier_tenantId_code_key" ON "Supplier"("tenantId", "code");
