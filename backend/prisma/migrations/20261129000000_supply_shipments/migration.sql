-- #250 Fase 4 (Centro de Abastecimiento): envíos entrantes (lotes) de una
-- compra. Aditiva e idempotente. El lote es un envío externo (bus,
-- transportadora, AEX o importación), nunca un traslado interno; la recepción
-- (F5) es la única que crea stock.
CREATE TABLE IF NOT EXISTS "SupplyShipment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "destinationBranchId" TEXT,
    "method" TEXT NOT NULL,
    "company" TEXT,
    "driver" TEXT,
    "guide" TEXT,
    "responsibleId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'BORRADOR',
    "etaAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "arrivedAt" TIMESTAMP(3),
    "notes" TEXT,
    "publicToken" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplyShipment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SupplyShipment_tenantId_code_key" ON "SupplyShipment"("tenantId", "code");
CREATE UNIQUE INDEX IF NOT EXISTS "SupplyShipment_publicToken_key" ON "SupplyShipment"("publicToken");
CREATE INDEX IF NOT EXISTS "SupplyShipment_tenantId_status_createdAt_idx" ON "SupplyShipment"("tenantId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "SupplyShipment_tenantId_purchaseId_idx" ON "SupplyShipment"("tenantId", "purchaseId");

ALTER TABLE "SupplyShipment" DROP CONSTRAINT IF EXISTS "SupplyShipment_tenantId_fkey";
ALTER TABLE "SupplyShipment" ADD CONSTRAINT "SupplyShipment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplyShipment" DROP CONSTRAINT IF EXISTS "SupplyShipment_purchaseId_fkey";
ALTER TABLE "SupplyShipment" ADD CONSTRAINT "SupplyShipment_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "SupplyPurchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplyShipment" DROP CONSTRAINT IF EXISTS "SupplyShipment_destinationBranchId_fkey";
ALTER TABLE "SupplyShipment" ADD CONSTRAINT "SupplyShipment_destinationBranchId_fkey" FOREIGN KEY ("destinationBranchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupplyShipment" DROP CONSTRAINT IF EXISTS "SupplyShipment_responsibleId_fkey";
ALTER TABLE "SupplyShipment" ADD CONSTRAINT "SupplyShipment_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupplyShipment" DROP CONSTRAINT IF EXISTS "SupplyShipment_createdById_fkey";
ALTER TABLE "SupplyShipment" ADD CONSTRAINT "SupplyShipment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "SupplyShipmentItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "serial" TEXT,
    "status" TEXT NOT NULL DEFAULT 'EN_LOTE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplyShipmentItem_pkey" PRIMARY KEY ("id")
);

-- Un serial no puede viajar en dos lotes; los pendientes (NULL) conviven.
CREATE UNIQUE INDEX IF NOT EXISTS "SupplyShipmentItem_tenantId_serial_key" ON "SupplyShipmentItem"("tenantId", "serial");
CREATE INDEX IF NOT EXISTS "SupplyShipmentItem_tenantId_shipmentId_idx" ON "SupplyShipmentItem"("tenantId", "shipmentId");
CREATE INDEX IF NOT EXISTS "SupplyShipmentItem_tenantId_lineId_idx" ON "SupplyShipmentItem"("tenantId", "lineId");

ALTER TABLE "SupplyShipmentItem" DROP CONSTRAINT IF EXISTS "SupplyShipmentItem_tenantId_fkey";
ALTER TABLE "SupplyShipmentItem" ADD CONSTRAINT "SupplyShipmentItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplyShipmentItem" DROP CONSTRAINT IF EXISTS "SupplyShipmentItem_shipmentId_fkey";
ALTER TABLE "SupplyShipmentItem" ADD CONSTRAINT "SupplyShipmentItem_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "SupplyShipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplyShipmentItem" DROP CONSTRAINT IF EXISTS "SupplyShipmentItem_lineId_fkey";
ALTER TABLE "SupplyShipmentItem" ADD CONSTRAINT "SupplyShipmentItem_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "SupplyPurchaseLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplyShipmentItem" DROP CONSTRAINT IF EXISTS "SupplyShipmentItem_productId_fkey";
ALTER TABLE "SupplyShipmentItem" ADD CONSTRAINT "SupplyShipmentItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
