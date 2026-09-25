-- #250 · Repuestos del taller con tenencia y pago (propios contados/a crédito y
-- de proveedor en depósito/consignación o a crédito). No tocan el stock
-- vendible: son tablas propias con dueño explícito y trazabilidad.
CREATE TABLE IF NOT EXISTS "WorkshopPart" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "productId" TEXT,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "ownership" TEXT NOT NULL DEFAULT 'PROPIO',
    "supplierId" TEXT,
    "paymentMode" TEXT NOT NULL DEFAULT 'CONTADO',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "usedQuantity" INTEGER NOT NULL DEFAULT 0,
    "unitCostPyg" INTEGER,
    "totalCostPyg" INTEGER,
    "dueAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "locationId" TEXT,
    "branchId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DISPONIBLE',
    "serviceOrderId" TEXT,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkshopPart_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WorkshopPart_tenantId_code_key" ON "WorkshopPart"("tenantId", "code");
CREATE INDEX IF NOT EXISTS "WorkshopPart_tenantId_status_ownership_idx" ON "WorkshopPart"("tenantId", "status", "ownership");
CREATE INDEX IF NOT EXISTS "WorkshopPart_tenantId_paymentMode_paidAt_idx" ON "WorkshopPart"("tenantId", "paymentMode", "paidAt");
CREATE INDEX IF NOT EXISTS "WorkshopPart_tenantId_supplierId_status_idx" ON "WorkshopPart"("tenantId", "supplierId", "status");
CREATE INDEX IF NOT EXISTS "WorkshopPart_tenantId_branchId_locationId_idx" ON "WorkshopPart"("tenantId", "branchId", "locationId");
CREATE INDEX IF NOT EXISTS "WorkshopPart_tenantId_serviceOrderId_idx" ON "WorkshopPart"("tenantId", "serviceOrderId");

ALTER TABLE "WorkshopPart" DROP CONSTRAINT IF EXISTS "WorkshopPart_tenantId_fkey";
ALTER TABLE "WorkshopPart" ADD CONSTRAINT "WorkshopPart_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkshopPart" DROP CONSTRAINT IF EXISTS "WorkshopPart_productId_fkey";
ALTER TABLE "WorkshopPart" ADD CONSTRAINT "WorkshopPart_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkshopPart" DROP CONSTRAINT IF EXISTS "WorkshopPart_supplierId_fkey";
ALTER TABLE "WorkshopPart" ADD CONSTRAINT "WorkshopPart_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkshopPart" DROP CONSTRAINT IF EXISTS "WorkshopPart_locationId_fkey";
ALTER TABLE "WorkshopPart" ADD CONSTRAINT "WorkshopPart_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "StockLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkshopPart" DROP CONSTRAINT IF EXISTS "WorkshopPart_branchId_fkey";
ALTER TABLE "WorkshopPart" ADD CONSTRAINT "WorkshopPart_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkshopPart" DROP CONSTRAINT IF EXISTS "WorkshopPart_serviceOrderId_fkey";
ALTER TABLE "WorkshopPart" ADD CONSTRAINT "WorkshopPart_serviceOrderId_fkey" FOREIGN KEY ("serviceOrderId") REFERENCES "ServiceOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkshopPart" DROP CONSTRAINT IF EXISTS "WorkshopPart_createdById_fkey";
ALTER TABLE "WorkshopPart" ADD CONSTRAINT "WorkshopPart_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "WorkshopPartMovement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "amountPyg" INTEGER,
    "serviceOrderId" TEXT,
    "note" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkshopPartMovement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "WorkshopPartMovement_tenantId_partId_createdAt_idx" ON "WorkshopPartMovement"("tenantId", "partId", "createdAt");
CREATE INDEX IF NOT EXISTS "WorkshopPartMovement_tenantId_kind_createdAt_idx" ON "WorkshopPartMovement"("tenantId", "kind", "createdAt");
CREATE INDEX IF NOT EXISTS "WorkshopPartMovement_tenantId_serviceOrderId_idx" ON "WorkshopPartMovement"("tenantId", "serviceOrderId");

ALTER TABLE "WorkshopPartMovement" DROP CONSTRAINT IF EXISTS "WorkshopPartMovement_tenantId_fkey";
ALTER TABLE "WorkshopPartMovement" ADD CONSTRAINT "WorkshopPartMovement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkshopPartMovement" DROP CONSTRAINT IF EXISTS "WorkshopPartMovement_partId_fkey";
ALTER TABLE "WorkshopPartMovement" ADD CONSTRAINT "WorkshopPartMovement_partId_fkey" FOREIGN KEY ("partId") REFERENCES "WorkshopPart"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkshopPartMovement" DROP CONSTRAINT IF EXISTS "WorkshopPartMovement_serviceOrderId_fkey";
ALTER TABLE "WorkshopPartMovement" ADD CONSTRAINT "WorkshopPartMovement_serviceOrderId_fkey" FOREIGN KEY ("serviceOrderId") REFERENCES "ServiceOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkshopPartMovement" DROP CONSTRAINT IF EXISTS "WorkshopPartMovement_userId_fkey";
ALTER TABLE "WorkshopPartMovement" ADD CONSTRAINT "WorkshopPartMovement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
