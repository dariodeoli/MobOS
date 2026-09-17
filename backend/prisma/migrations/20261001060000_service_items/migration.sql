-- Catálogo de servicios técnicos + servicio elegido en la orden.
CREATE TABLE "ServiceItem" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "deviceType" TEXT NOT NULL DEFAULT 'iPhone',
  "suggestedPricePyg" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ServiceItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ServiceItem_tenantId_name_key" ON "ServiceItem"("tenantId", "name");
CREATE INDEX "ServiceItem_tenantId_isActive_idx" ON "ServiceItem"("tenantId", "isActive");
ALTER TABLE "ServiceOrder" ADD COLUMN "serviceName" TEXT;
