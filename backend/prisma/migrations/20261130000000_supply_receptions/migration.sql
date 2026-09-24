-- #250 Fase 5 (Centro de Abastecimiento): recepción del envío entrante. Se
-- escanea contra el manifiesto y **solo al confirmar** se crean las unidades en
-- stock; faltantes/sobrantes/dañados/incorrectos quedan como incidencia.
CREATE TABLE IF NOT EXISTS "SupplyReception" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "locationId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'BORRADOR',
    "receivedById" TEXT,
    "receivedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplyReception_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SupplyReception_tenantId_status_createdAt_idx" ON "SupplyReception"("tenantId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "SupplyReception_tenantId_shipmentId_idx" ON "SupplyReception"("tenantId", "shipmentId");

ALTER TABLE "SupplyReception" DROP CONSTRAINT IF EXISTS "SupplyReception_tenantId_fkey";
ALTER TABLE "SupplyReception" ADD CONSTRAINT "SupplyReception_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplyReception" DROP CONSTRAINT IF EXISTS "SupplyReception_shipmentId_fkey";
ALTER TABLE "SupplyReception" ADD CONSTRAINT "SupplyReception_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "SupplyShipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplyReception" DROP CONSTRAINT IF EXISTS "SupplyReception_locationId_fkey";
ALTER TABLE "SupplyReception" ADD CONSTRAINT "SupplyReception_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "StockLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupplyReception" DROP CONSTRAINT IF EXISTS "SupplyReception_receivedById_fkey";
ALTER TABLE "SupplyReception" ADD CONSTRAINT "SupplyReception_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupplyReception" DROP CONSTRAINT IF EXISTS "SupplyReception_createdById_fkey";
ALTER TABLE "SupplyReception" ADD CONSTRAINT "SupplyReception_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "SupplyReceptionItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "receptionId" TEXT NOT NULL,
    "shipmentItemId" TEXT,
    "serial" TEXT,
    "productId" TEXT NOT NULL,
    "resultado" TEXT NOT NULL,
    "nota" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplyReceptionItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SupplyReceptionItem_tenantId_receptionId_idx" ON "SupplyReceptionItem"("tenantId", "receptionId");
CREATE INDEX IF NOT EXISTS "SupplyReceptionItem_tenantId_shipmentItemId_idx" ON "SupplyReceptionItem"("tenantId", "shipmentItemId");

ALTER TABLE "SupplyReceptionItem" DROP CONSTRAINT IF EXISTS "SupplyReceptionItem_tenantId_fkey";
ALTER TABLE "SupplyReceptionItem" ADD CONSTRAINT "SupplyReceptionItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplyReceptionItem" DROP CONSTRAINT IF EXISTS "SupplyReceptionItem_receptionId_fkey";
ALTER TABLE "SupplyReceptionItem" ADD CONSTRAINT "SupplyReceptionItem_receptionId_fkey" FOREIGN KEY ("receptionId") REFERENCES "SupplyReception"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplyReceptionItem" DROP CONSTRAINT IF EXISTS "SupplyReceptionItem_shipmentItemId_fkey";
ALTER TABLE "SupplyReceptionItem" ADD CONSTRAINT "SupplyReceptionItem_shipmentItemId_fkey" FOREIGN KEY ("shipmentItemId") REFERENCES "SupplyShipmentItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupplyReceptionItem" DROP CONSTRAINT IF EXISTS "SupplyReceptionItem_productId_fkey";
ALTER TABLE "SupplyReceptionItem" ADD CONSTRAINT "SupplyReceptionItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
