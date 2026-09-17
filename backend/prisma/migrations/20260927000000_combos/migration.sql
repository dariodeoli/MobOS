-- Combos: paquetes de productos con precio fijo (ej. funda + lámina).
CREATE TABLE "Combo" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "branchId" TEXT,
  "name" TEXT NOT NULL,
  "pricePyg" INTEGER NOT NULL,
  "items" JSONB NOT NULL DEFAULT '[]',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Combo_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Combo_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Combo_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "Combo_tenantId_isActive_idx" ON "Combo"("tenantId", "isActive");
CREATE INDEX "Combo_branchId_idx" ON "Combo"("branchId");
