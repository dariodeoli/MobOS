-- #250 Fase 6 (Centro de Abastecimiento): política de reposición por producto y
-- sucursal (stock de seguridad + plazo de entrega) para la reposición sugerida.
CREATE TABLE IF NOT EXISTS "SupplyPolicy" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "safetyStock" INTEGER NOT NULL DEFAULT 0,
    "leadTimeDays" INTEGER NOT NULL DEFAULT 7,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplyPolicy_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SupplyPolicy_tenantId_productId_branchId_key" ON "SupplyPolicy"("tenantId", "productId", "branchId");
CREATE INDEX IF NOT EXISTS "SupplyPolicy_tenantId_branchId_idx" ON "SupplyPolicy"("tenantId", "branchId");

ALTER TABLE "SupplyPolicy" DROP CONSTRAINT IF EXISTS "SupplyPolicy_tenantId_fkey";
ALTER TABLE "SupplyPolicy" ADD CONSTRAINT "SupplyPolicy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplyPolicy" DROP CONSTRAINT IF EXISTS "SupplyPolicy_productId_fkey";
ALTER TABLE "SupplyPolicy" ADD CONSTRAINT "SupplyPolicy_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplyPolicy" DROP CONSTRAINT IF EXISTS "SupplyPolicy_branchId_fkey";
ALTER TABLE "SupplyPolicy" ADD CONSTRAINT "SupplyPolicy_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplyPolicy" DROP CONSTRAINT IF EXISTS "SupplyPolicy_updatedById_fkey";
ALTER TABLE "SupplyPolicy" ADD CONSTRAINT "SupplyPolicy_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
