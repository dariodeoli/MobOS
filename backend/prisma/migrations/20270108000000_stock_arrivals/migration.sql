-- Llegada de mercadería como la planilla (#408, unidad C): cabecera y líneas del
-- lote pegado. Aditiva e idempotente (cada objeto con guard). No toca stock:
-- las unidades, traslados y ajustes se crean al confirmar (unidad E).

DO $$ BEGIN CREATE TYPE "StockArrivalStatus" AS ENUM ('BORRADOR', 'CONFIRMADA', 'CANCELADA'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "StockArrivalSource" AS ENUM ('PEGADO', 'IMPORT_INICIAL'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ArrivalSerialKind" AS ENUM ('IMEI', 'SERIE', 'NINGUNO'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ArrivalMatch" AS ENUM ('EXACTO', 'POR_MODELO', 'SOBRANTE', 'NO_LLEGO'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ArrivalDestination" AS ENUM ('STOCK', 'OTRA_SUCURSAL', 'DEVOLVER', 'FALTA_IMEI', 'TECNICO'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "StockArrival" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "arrivedAt" TIMESTAMP(3) NOT NULL,
  "status" "StockArrivalStatus" NOT NULL DEFAULT 'BORRADOR',
  "source" "StockArrivalSource" NOT NULL DEFAULT 'PEGADO',
  "currency" "PaymentCurrency" NOT NULL DEFAULT 'USD',
  "exchangeRatePyg" DECIMAL(14,4),
  "purchaseIds" JSONB,
  "idempotencyKey" TEXT NOT NULL,
  "summary" JSONB,
  "createdById" TEXT NOT NULL,
  "confirmedById" TEXT,
  "confirmedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StockArrival_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "StockArrivalLine" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "arrivalId" TEXT NOT NULL,
  "rowIndex" INTEGER NOT NULL,
  "raw" JSONB NOT NULL,
  "productId" TEXT,
  "serial" TEXT,
  "serialKind" "ArrivalSerialKind" NOT NULL DEFAULT 'NINGUNO',
  "condition" "ProductCondition",
  "batteryPct" INTEGER,
  "batteryCycles" INTEGER,
  "warrantyUntil" TIMESTAMP(3),
  "supplierId" TEXT,
  "originalCost" DECIMAL(14,2),
  "costPyg" BIGINT,
  "note" TEXT,
  "match" "ArrivalMatch" NOT NULL DEFAULT 'SOBRANTE',
  "destination" "ArrivalDestination" NOT NULL DEFAULT 'STOCK',
  "destinationBranchId" TEXT,
  "issues" JSONB NOT NULL DEFAULT '[]',
  "purchaseLineId" TEXT,
  "shipmentItemId" TEXT,
  "needId" TEXT,
  "orderId" TEXT,
  "orderItemId" TEXT,
  "customerId" TEXT,
  "unitId" TEXT,
  "transferId" TEXT,
  "payableAdjustmentId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StockArrivalLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "StockArrival_tenantId_code_key" ON "StockArrival"("tenantId", "code");
CREATE UNIQUE INDEX IF NOT EXISTS "StockArrival_tenantId_idempotencyKey_key" ON "StockArrival"("tenantId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "StockArrival_tenantId_branchId_status_arrivedAt_idx" ON "StockArrival"("tenantId", "branchId", "status", "arrivedAt");
CREATE UNIQUE INDEX IF NOT EXISTS "StockArrivalLine_arrivalId_rowIndex_key" ON "StockArrivalLine"("arrivalId", "rowIndex");
CREATE INDEX IF NOT EXISTS "StockArrivalLine_tenantId_serial_idx" ON "StockArrivalLine"("tenantId", "serial");
CREATE INDEX IF NOT EXISTS "StockArrivalLine_tenantId_destination_unitId_idx" ON "StockArrivalLine"("tenantId", "destination", "unitId");

DO $$ BEGIN
  ALTER TABLE "StockArrival" ADD CONSTRAINT "StockArrival_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "StockArrival" ADD CONSTRAINT "StockArrival_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "StockArrivalLine" ADD CONSTRAINT "StockArrivalLine_arrivalId_fkey"
    FOREIGN KEY ("arrivalId") REFERENCES "StockArrival"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
