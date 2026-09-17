-- Órdenes de servicio técnico: pipeline del taller con costos y rentabilidad.
CREATE TABLE "ServiceOrder" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "branchId" TEXT,
  "customerId" TEXT,
  "customerName" TEXT NOT NULL,
  "device" TEXT NOT NULL,
  "serial" TEXT,
  "reportedIssue" TEXT,
  "diagnosis" TEXT,
  "checklist" JSONB NOT NULL DEFAULT '{}',
  "technicianId" TEXT,
  "technicianName" TEXT,
  "status" TEXT NOT NULL DEFAULT 'RECIBIDO',
  "pricePyg" INTEGER NOT NULL DEFAULT 0,
  "costPyg" INTEGER NOT NULL DEFAULT 0,
  "notes" TEXT,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deliveredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ServiceOrder_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ServiceOrder_tenantId_status_idx" ON "ServiceOrder"("tenantId", "status");
CREATE INDEX "ServiceOrder_tenantId_createdAt_idx" ON "ServiceOrder"("tenantId", "createdAt");
