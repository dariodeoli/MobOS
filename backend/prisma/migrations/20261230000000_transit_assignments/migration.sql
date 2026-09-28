-- A4 (#279) · Vender en tránsito: asignaciones futuras de unidades que viajan
-- (traslado interno o compra en camino) y su vínculo al recibirlas.
-- Aditiva e idempotente.
CREATE TABLE IF NOT EXISTS "TransitAssignment" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  "orderId" TEXT,
  "orderItemId" TEXT,
  "customerId" TEXT,
  "customerName" TEXT,
  "sellerId" TEXT NOT NULL,
  "branchId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ASIGNADA',
  "linkedAt" TIMESTAMP(3),
  "releasedAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TransitAssignment_pkey" PRIMARY KEY ("id")
);
-- Una sola asignación **viva** por unidad (las liberadas quedan como historial):
-- es el candado contra la doble asignación de una unidad futura.
CREATE UNIQUE INDEX IF NOT EXISTS "TransitAssignment_unit_viva_key" ON "TransitAssignment"("unitId") WHERE "status" <> 'LIBERADA';
CREATE INDEX IF NOT EXISTS "TransitAssignment_tenantId_status_createdAt_idx" ON "TransitAssignment"("tenantId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "TransitAssignment_tenantId_sellerId_status_idx" ON "TransitAssignment"("tenantId", "sellerId", "status");
CREATE INDEX IF NOT EXISTS "TransitAssignment_tenantId_orderId_idx" ON "TransitAssignment"("tenantId", "orderId");
CREATE INDEX IF NOT EXISTS "TransitAssignment_unitId_idx" ON "TransitAssignment"("unitId");
DO $$ BEGIN
  ALTER TABLE "TransitAssignment" ADD CONSTRAINT "TransitAssignment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "TransitAssignment" ADD CONSTRAINT "TransitAssignment_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "InventoryUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "TransitAssignment" ADD CONSTRAINT "TransitAssignment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "TransitAssignment" ADD CONSTRAINT "TransitAssignment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "TransitAssignment" ADD CONSTRAINT "TransitAssignment_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "TransitAssignment" ADD CONSTRAINT "TransitAssignment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
